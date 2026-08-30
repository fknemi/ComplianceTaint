import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as d3 from "d3";
import type { GraphElement, GraphNode, GraphEdge } from "@/types/graph";
import type { Violation, Severity } from "@/types/graph"; // move to @/types/violation if you split it out

const ROLE_COLOR: Record<string, string> = {
  source:    "#86c9a0",
  sink:      "#f4a4a4",
  log_sink:  "#f4a4a4",
  sanitizer: "#7ba7e8",
  normal:    "#c9c6bf",
};
const ROLE_STROKE: Record<string, string> = {
  source:    "#5aaf7a",
  sink:      "#e07070",
  log_sink:  "#e07070",
  sanitizer: "#4d84cc",
  normal:    "#a8a49d",
};
const IMPORTANT = new Set(["source", "sink", "sanitizer", "log_sink"]);

const ROLE_CENTERS: Record<string, { cx: number; cy: number }> = {
  source:    { cx: 0.2,  cy: 0.3  },
  sink:      { cx: 0.8,  cy: 0.7  },
  log_sink:  { cx: 0.8,  cy: 0.3  },
  sanitizer: { cx: 0.5,  cy: 0.15 },
  normal:    { cx: 0.5,  cy: 0.55 },
};

// Severity drives the traveling pulse + node ring color.
// Kept in the same desaturated-pastel family as ROLE_COLOR so it reads as
// part of the same system rather than a bolted-on alert palette.
const SEVERITY_COLOR: Record<Severity, string> = {
  Critical: "#e0708a",
  High:     "#e0a15c",
  Medium:   "#d6c15a",
  Low:      "#9bb6d6",
};

// Taint type -> small badge color. Falls back to a neutral dot for
// unrecognized taint types so new taintTypes values don't crash styling.
const TAINT_COLOR: Record<string, string> = {
  pci:    "#c2618a",
  secret: "#8a5cc2",
  pii:    "#5c8ac2",
};
const TAINT_FALLBACK = "#a8a49d";

// How long each violation stays active during auto-play before the
// sequence advances to the next one. Long enough to see several pulse
// cycles at the pulse loop's speed=46 setting.
const SEQUENCE_STEP_MS = 2200;

function getNodes(els: GraphElement[]): GraphNode[] {
  return els.filter((e): e is GraphNode => e.type !== "edge");
}
function getEdges(els: GraphElement[]): GraphEdge[] {
  return els.filter((e): e is GraphEdge => e.type === "edge");
}

interface D3Node extends GraphNode, d3.SimulationNodeDatum {
  x?: number; y?: number; fx?: number | null; fy?: number | null;
}
interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  edge_type: string; data_flow_type: string;
}

type Mode = "links" | "cluster";

// After sim settles, compute a tight enclosing circle per role group
// using the actual node positions, then pad it.
function repositionBubbles(
  bubblesG: d3.Selection<SVGGElement, unknown, null, undefined>,
  nodes: D3Node[],
  W: number,
  H: number
) {
  const byRole: Record<string, D3Node[]> = {};
  nodes.forEach(n => {
    if (!byRole[n.role]) byRole[n.role] = [];
    byRole[n.role].push(n);
  });

  bubblesG.selectAll("*").remove();

  Object.entries(byRole).forEach(([role, rNodes]) => {
    const xs = rNodes.map(n => n.x ?? W / 2);
    const ys = rNodes.map(n => n.y ?? H / 2);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    // farthest node from centroid + node radius + padding
    const maxDist = Math.max(...rNodes.map(n => Math.hypot((n.x ?? cx) - cx, (n.y ?? cy) - cy)));
    const r = Math.max(48, maxDist + 32);

    bubblesG.append("circle")
      .attr("cx", cx).attr("cy", cy).attr("r", r)
      .attr("fill",             ROLE_COLOR[role] + "0d")
      .attr("stroke",           ROLE_COLOR[role] + "55")
      .attr("stroke-width",     1.5)
      .attr("stroke-dasharray", "6,4");

    bubblesG.append("text")
      .attr("x", cx).attr("y", cy - r - 7)
      .attr("text-anchor", "middle")
      .attr("font-size",   11)
      .attr("fill",        ROLE_STROKE[role])
      .attr("opacity",     0.7)
      .attr("font-family", "inherit")
      .text(role.replace("_", " ").toUpperCase());
  });
}

// Pans/zooms the view to frame a violation path's nodes. Reads live x/y off
// the sim-positioned nodes (not the raw graph data, which has no coordinates
// until the simulation places them), so this only makes sense to call after
// at least one tick — in practice the sim has usually been running for a
// while by the time a violation gets activated, so this is a non-issue.
//
// Bails out silently rather than zooming somewhere meaningless when:
//   - none of the path's node IDs are present in the current node set
//     (can happen under "Key nodes" mode, same reason pathLinks can end up
//     empty in the animation effect below), or
//   - the path resolves to a single node, which has no meaningful "frame".
function fitToPath(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  zoom: d3.ZoomBehavior<SVGSVGElement, unknown>,
  nodes: D3Node[],
  pathIds: Set<string>,
  W: number,
  H: number
) {
  const pathNodes = nodes.filter(n => pathIds.has(n.id) && n.x != null && n.y != null);
  if (pathNodes.length < 2) return;

  const xs = pathNodes.map(n => n.x as number);
  const ys = pathNodes.map(n => n.y as number);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  // Generous padding: labels, role halos, and taint badges all extend past
  // a node's own circle, and a tight fit would clip them right at the edge.
  const PAD = 120;
  const boxW = Math.max(maxX - minX + PAD * 2, 1);
  const boxH = Math.max(maxY - minY + PAD * 2, 1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const rawScale = Math.min(W / boxW, H / boxH);
  // Clamp tighter than the zoom behavior's own [0.05, 5] extent — a 2-node
  // path a few px apart would otherwise compute a jarring 5x snap, and a
  // sprawling path would zoom out further than "focus on this" should mean.
  const scale = Math.min(Math.max(rawScale, 0.4), 2.5);

  const transform = d3.zoomIdentity
    .translate(W / 2, H / 2)
    .scale(scale)
    .translate(-cx, -cy);

  svg.transition()
    .duration(750)
    .ease(d3.easeCubicInOut)
    .call(zoom.transform, transform);
}

interface GraphViewProps {
  elements: GraphElement[];
  violations?: Violation[];
}

export default function GraphView({ elements, violations = [] }: GraphViewProps) {
  const svgRef        = useRef<SVGSVGElement>(null);
  const simRef        = useRef<d3.Simulation<D3Node, D3Link> | null>(null);
  const linkForceRef  = useRef<d3.ForceLink<D3Node, D3Link> | null>(null);
  const bubblesGRef   = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const nodesRef      = useRef<D3Node[]>([]);
  const linksRef      = useRef<D3Link[]>([]);
  const nodeElRef     = useRef<d3.Selection<SVGGElement, D3Node, SVGGElement, unknown> | null>(null);
  const pulseGRef     = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef       = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const rafRef        = useRef<number | null>(null);
  const builtRef      = useRef(false);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mode,      setMode]      = useState<Mode>("links");
  const [showAll,   setShowAll]   = useState(true);
  const [distance,  setDistance]  = useState(220);
  const [strength,  setStrength]  = useState(25);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState({ nodes: 0, edges: 0 });

  const [activeViolation, setActiveViolation] = useState<Violation | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  // Auto-play state. `sequenceRunning` is the on/off switch driven by the
  // toggle button. `revealedViolations` is what the panel actually renders
  // while a sequence is live or has run at least once — it starts empty
  // and gets one violation appended per step, which is what makes the
  // panel build up instead of showing all four immediately.
  // `sequenceIndexRef` tracks the current position in `violations` outside
  // React state, since the setTimeout chain below needs to read the latest
  // index without re-subscribing itself on every render.
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const [revealedViolations, setRevealedViolations] = useState<Violation[]>([]);
  const sequenceIndexRef = useRef(0);

  const activeElements = useMemo(() => {
    if (showAll) return elements;
    const nodes = getNodes(elements);
    const edges = getEdges(elements);
    const impIds = new Set(nodes.filter(n => IMPORTANT.has(n.role)).map(n => n.id));
    const relEdges = edges.filter(e => impIds.has(e.source) && impIds.has(e.target));
    const nbIds = new Set(relEdges.flatMap(e => [e.source, e.target]));
    return [
      ...nodes.filter(n => impIds.has(n.id) || nbIds.has(n.id)),
      ...relEdges,
    ] as GraphElement[];
  }, [elements, showAll]);

  // Path ids for the currently animating violation, as a Set for fast lookup,
  // plus the ordered consecutive-pair list edges must match against.
  const activePathIds = useMemo(
    () => new Set(activeViolation?.path ?? []),
    [activeViolation]
  );
  const activePathPairs = useMemo(() => {
    const p = activeViolation?.path ?? [];
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < p.length - 1; i++) pairs.push([p[i], p[i + 1]]);
    return pairs;
  }, [activeViolation]);

  // Stops a running sequence: clears the pending timer, flips the running
  // flag off. Deliberately does not touch activeViolation — callers decide
  // separately whether the currently-showing violation should stay on
  // screen (auto-play reaching the end) or get replaced (user clicked a
  // different row).
  const stopSequence = useCallback(() => {
    if (sequenceTimerRef.current != null) {
      clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }
    setSequenceRunning(false);
  }, []);

  // The engine. Activates violations[i], appends it to the panel's
  // accumulating list, then schedules itself again for i+1 after
  // SEQUENCE_STEP_MS. Reads `violations` fresh via closure each call
  // rather than a captured snapshot, so it can't animate a stale array —
  // in practice the rebuild effect below cancels the run entirely if
  // `violations`'s source data changes shape, but this keeps the function
  // itself correct regardless.
  const advanceSequence = useCallback(() => {
    const i = sequenceIndexRef.current;
    if (i >= violations.length) {
      stopSequence();
      return;
    }
    const v = violations[i];
    setActiveViolation(v);
    setRevealedViolations(prev => [...prev, v]);
    sequenceIndexRef.current = i + 1;
    sequenceTimerRef.current = setTimeout(advanceSequence, SEQUENCE_STEP_MS);
  }, [violations, stopSequence]);

  // Toggle handler for the "Animate all" button. Starting resets the index
  // and the panel's accumulated list to empty, then fires step 0
  // immediately — no initial dead wait before the first violation lights
  // up. Toggling off mid-run just stops the timer; whatever's currently
  // animating stays on screen rather than snapping back to a blank graph,
  // since this read more like a pause than an undo.
  const toggleSequence = useCallback(() => {
    if (sequenceRunning) {
      stopSequence();
      return;
    }
    setSelected(null);
    sequenceIndexRef.current = 0;
    setRevealedViolations([]);
    setSequenceRunning(true);
    advanceSequence();
  }, [sequenceRunning, stopSequence, advanceSequence]);

  // Live-update link distance
  useEffect(() => {
    if (!builtRef.current) return;
    linkForceRef.current?.distance(distance);
    simRef.current?.alpha(0.3).restart();
  }, [distance]);

  // Live-update cluster pull strength
  useEffect(() => {
    if (!builtRef.current || mode !== "cluster") return;
    const pull = strength / 100;
    const W = svgRef.current?.parentElement?.clientWidth  ?? 800;
    const H = svgRef.current?.parentElement?.clientHeight ?? 600;
    simRef.current?.force("cx", d3.forceX<D3Node>()
      .x(d => (ROLE_CENTERS[d.role]?.cx ?? 0.5) * W).strength(pull));
    simRef.current?.force("cy", d3.forceY<D3Node>()
      .y(d => (ROLE_CENTERS[d.role]?.cy ?? 0.5) * H).strength(pull));
    simRef.current?.alpha(0.3).restart();
  }, [strength, mode]);

  const buildGraph = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    simRef.current?.stop();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    const svg = d3.select(svgEl);
    const W = svgEl.parentElement!.clientWidth;
    const H = svgEl.parentElement!.clientHeight;

    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    const mkArrow = (id: string, fill: string) =>
      defs.append("marker")
        .attr("id", id).attr("markerWidth", 6).attr("markerHeight", 6)
        .attr("refX", 5).attr("refY", 3).attr("orient", "auto")
        .append("path").attr("d", "M0,0 L0,6 L6,3 z").attr("fill", fill);
    mkArrow("arr-primary",  "#d4d1cb");
    mkArrow("arr-implicit", "#c4b5f0");
    mkArrow("arr-active",   "#7ba7e8");

    const root = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 5])
      .on("zoom", e => root.attr("transform", e.transform));
    svg.call(zoom);
    zoomRef.current = zoom;
    svg.on("click", e => {
      if (e.target === svgEl || (e.target as Element).tagName === "svg")
        setSelected(null);
    });

    // Bubbles layer goes under edges+nodes — drawn AFTER sim settles
    const bubblesG = root.append("g").attr("class", "bubbles");
    bubblesGRef.current = bubblesG;

    const rawNodes = getNodes(activeElements);
    const rawEdges = getEdges(activeElements);
    const nodeMap  = new Map(rawNodes.map(n => [n.id, n]));
    setNodeCount({ nodes: rawNodes.length, edges: rawEdges.length });

    const nodes: D3Node[] = rawNodes.map(n => ({ ...n }));
    nodesRef.current = nodes;

    const links: D3Link[] = rawEdges
      .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map(e => ({ source: e.source, target: e.target, edge_type: e.edge_type, data_flow_type: e.data_flow_type }));
    linksRef.current = links;

    const pull = strength / 100;

    const linkForce = d3.forceLink<D3Node, D3Link>(links)
      .id(d => d.id)
      .distance(distance)
      .strength(mode === "cluster" ? 0.15 : 0.4);
    linkForceRef.current = linkForce;

    const sim = d3.forceSimulation<D3Node>(nodes)
      .force("link",      linkForce)
      .force("charge",    d3.forceManyBody()
        .strength(mode === "cluster" ? -320 : -1000)
        .distanceMax(700))
      .force("center",    d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(mode === "cluster" ? 32 : 44));

    if (mode === "cluster") {
      sim
        .force("cx", d3.forceX<D3Node>()
          .x(d => (ROLE_CENTERS[d.role]?.cx ?? 0.5) * W).strength(pull))
        .force("cy", d3.forceY<D3Node>()
          .y(d => (ROLE_CENTERS[d.role]?.cy ?? 0.5) * H).strength(pull));
    } else {
      sim
        .force("cx", d3.forceX(W / 2).strength(0.02))
        .force("cy", d3.forceY(H / 2).strength(0.02));
    }

    simRef.current   = sim;
    builtRef.current = true;

    // Edges
    const edgeEl = root.append("g")
      .selectAll<SVGLineElement, D3Link>("line")
      .data(links).join("line")
      .attr("stroke",           d => d.edge_type === "implicit" ? "#c4b5f0" : "#d4d1cb")
      .attr("stroke-width",     d => d.edge_type === "implicit" ? 1.5 : 1.2)
      .attr("stroke-dasharray", d => d.edge_type === "implicit" ? "5,4" : null)
      .attr("opacity",          0.65)
      .attr("marker-end",       d => d.edge_type === "implicit" ? "url(#arr-implicit)" : "url(#arr-primary)");

    // Pulse overlay layer — sits above edges, below nodes. One <line> per
    // violation-path edge gets drawn into here on demand (see the
    // violation-animation effect below); it's empty otherwise.
    const pulseG = root.append("g").attr("class", "violation-pulses").style("pointer-events", "none");
    pulseGRef.current = pulseG;

    // Nodes
    // NOTE: this group is tagged "graph-nodes" specifically so it can be
    // targeted unambiguously later (see the violation/selection effects
    // below). Without a class here, "g > g" also matches the sibling
    // `bubbles` and `violation-pulses` groups, which are g > g too — as
    // groups they carry no bound datum, so d3 hands back undefined for
    // those and any .attr(fn) touching `n.id` throws immediately.
    const nodeEl = root.append("g")
      .attr("class", "graph-nodes")
      .selectAll<SVGGElement, D3Node>("g")
      .data(nodes).join("g")
      .style("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, D3Node>()
          .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
          .on("end",   (ev, d) => {
            if (!ev.active) sim.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      )
      .on("click", (ev, d) => {
        ev.stopPropagation();
        setSelected(prev => prev === d.id ? null : d.id);
      });
    nodeElRef.current = nodeEl;

    nodeEl.filter(d => IMPORTANT.has(d.role))
      .append("circle")
      .attr("class", "role-halo")
      .attr("r", 15)
      .attr("fill",         d => ROLE_COLOR[d.role] + "1a")
      .attr("stroke",       d => ROLE_COLOR[d.role] + "55")
      .attr("stroke-width", 1);

    // Violation ring — hidden (r=0) unless the node sits on the active path.
    // Drawn once here, toggled by the effect below rather than rebuilt per
    // violation so switching violations doesn't restart the sim's DOM.
    nodeEl.append("circle")
      .attr("class", "violation-ring")
      .attr("r", 0)
      .attr("fill", "none")
      .attr("stroke-width", 2.5)
      .attr("opacity", 0);

    nodeEl.append("circle")
      .attr("class", "role-dot")
      .attr("r",            d => IMPORTANT.has(d.role) ? 9 : 5)
      .attr("fill",         d => ROLE_COLOR[d.role] ?? ROLE_COLOR.normal)
      .attr("stroke",       d => ROLE_STROKE[d.role] ?? ROLE_STROKE.normal)
      .attr("stroke-width", d => IMPORTANT.has(d.role) ? 2 : 1.5);

    nodeEl.append("text")
      .attr("dy",             d => (IMPORTANT.has(d.role) ? 15 : 5) + 13)
      .attr("text-anchor",    "middle")
      .attr("font-size",      10)
      .attr("fill",           "#9b9890")
      .attr("font-family",    "'SF Mono','Fira Code',monospace")
      .attr("pointer-events", "none")
      .text(d => d.function);

    // Taint badges — small dots stacked above the node label, one per
    // taintTypes entry, only rendered for nodes that are a violation's
    // sourceNode or sinkNode. Empty <g> per node; populated by the
    // violation effect so this doesn't need to know about violations
    // at graph-build time.
    nodeEl.append("g")
      .attr("class", "taint-badges")
      .attr("transform", d => `translate(0, ${-(IMPORTANT.has(d.role) ? 15 : 5) - 8})`);

    let bubbleUpdateScheduled = false;

    sim.on("tick", () => {
      edgeEl
        .attr("x1", d => (d.source as D3Node).x ?? 0)
        .attr("y1", d => (d.source as D3Node).y ?? 0)
        .attr("x2", d => (d.target as D3Node).x ?? 0)
        .attr("y2", d => (d.target as D3Node).y ?? 0);
      nodeEl.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);

      // Keep pulse overlay lines glued to the same endpoints as the real
      // edges — cheap since it's usually 1-3 lines, not the whole graph.
      pulseG.selectAll<SVGLineElement, D3Link>("line")
        .attr("x1", d => (d.source as D3Node).x ?? 0)
        .attr("y1", d => (d.source as D3Node).y ?? 0)
        .attr("x2", d => (d.target as D3Node).x ?? 0)
        .attr("y2", d => (d.target as D3Node).y ?? 0);

      // Throttle bubble redraws to every ~8 ticks while sim is running
      if (mode === "cluster" && bubblesGRef.current) {
        if (!bubbleUpdateScheduled) {
          bubbleUpdateScheduled = true;
          requestAnimationFrame(() => {
            if (bubblesGRef.current) repositionBubbles(bubblesGRef.current, nodesRef.current, W, H);
            bubbleUpdateScheduled = false;
          });
        }
      }
    });

    // Final precise redraw when sim fully cools
    sim.on("end", () => {
      if (mode === "cluster" && bubblesGRef.current) {
        repositionBubbles(bubblesGRef.current, nodesRef.current, W, H);
      }
    });

  }, [activeElements, mode]);

  useEffect(() => {
    builtRef.current = false;
    buildGraph();
    return () => {
      simRef.current?.stop();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [buildGraph]);

  // Rebuilding the graph (new data, mode switch) invalidates any in-flight
  // violation animation's DOM refs, so drop it rather than animate into a
  // graph that no longer has those nodes. A running auto-play sequence
  // would otherwise keep calling setActiveViolation into that stale graph
  // on its next tick, so it gets stopped here too, same trigger, same
  // reason, and the panel's accumulated list resets alongside it.
  useEffect(() => {
    setActiveViolation(null);
    stopSequence();
    setRevealedViolations([]);
  }, [activeElements, mode, stopSequence]);

  // Highlight selected (click-to-isolate) — unchanged, but skipped while a
  // violation animation owns the highlighting so the two don't fight over
  // opacity/stroke on the same elements.
  useEffect(() => {
    if (activeViolation) return;
    const svg    = d3.select(svgRef.current!);
    const edgeEl = svg.selectAll<SVGLineElement, D3Link>("g:not(.violation-pulses) > line");
    const nodeEl = svg.selectAll<SVGGElement, D3Node>("g.graph-nodes > g");

    if (!selected) {
      edgeEl
        .attr("stroke",     d => d.edge_type === "implicit" ? "#c4b5f0" : "#d4d1cb")
        .attr("opacity",    0.65)
        .attr("marker-end", d => d.edge_type === "implicit" ? "url(#arr-implicit)" : "url(#arr-primary)");
      nodeEl.attr("opacity", 1);
      return;
    }

    const allLinks = edgeEl.data();
    edgeEl
      .attr("stroke", d => {
        const s = (d.source as D3Node).id, t = (d.target as D3Node).id;
        return (s === selected || t === selected) ? "#7ba7e8"
          : d.edge_type === "implicit" ? "#c4b5f0" : "#d4d1cb";
      })
      .attr("opacity", d => {
        const s = (d.source as D3Node).id, t = (d.target as D3Node).id;
        return (s === selected || t === selected) ? 1 : 0.06;
      })
      .attr("marker-end", d => {
        const s = (d.source as D3Node).id, t = (d.target as D3Node).id;
        return (s === selected || t === selected) ? "url(#arr-active)"
          : d.edge_type === "implicit" ? "url(#arr-implicit)" : "url(#arr-primary)";
      });

    nodeEl.attr("opacity", (n: D3Node) => {
      if (n.id === selected) return 1;
      return allLinks.some(l =>
        ((l.source as D3Node).id === selected && (l.target as D3Node).id === n.id) ||
        ((l.target as D3Node).id === selected && (l.source as D3Node).id === n.id)
      ) ? 1 : 0.1;
    });
  }, [selected, activeViolation]);

  // --- Violation path animation -------------------------------------------
  // Runs whenever activeViolation changes. Dims everything not on the path,
  // draws a colored pulse traveling along each path edge, rings the path's
  // nodes in the severity color, and stamps taint badges on source/sink.
  // Completely unchanged from the click-driven version — it doesn't know or
  // care whether activeViolation was set by a manual click or by the
  // auto-play sequence timer, which is what lets both drive the same effect
  // without duplicating any pulse/ring/badge logic.
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svg.node()) return;

    const edgeSel  = svg.selectAll<SVGLineElement, D3Link>("g:not(.violation-pulses) > line");
    const nodeSel  = svg.selectAll<SVGGElement, D3Node>("g.graph-nodes > g");
    const pulseG   = pulseGRef.current;

    // Always clear prior pulse lines and cancel any running rAF loop first —
    // covers both "switched to a new violation" and "cleared to null".
    pulseG?.selectAll("*").remove();
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!activeViolation) {
      // Reset dimming/rings/badges to baseline.
      edgeSel
        .attr("stroke",  d => d.edge_type === "implicit" ? "#c4b5f0" : "#d4d1cb")
        .attr("opacity", 0.65);
      nodeSel.attr("opacity", 1);
      nodeSel.select<SVGCircleElement>("circle.violation-ring")
        .attr("r", 0).attr("opacity", 0);
      nodeSel.select<SVGGElement>("g.taint-badges").selectAll("*").remove();
      return;
    }

    const sevColor = SEVERITY_COLOR[activeViolation.severity] ?? SEVERITY_COLOR.Low;

    // Auto-zoom to frame the path. Fires once per violation activation
    // (this whole effect re-runs on activeViolation change, and this call
    // sits above the pulse loop rather than inside it, so it's a single
    // transition per activation — not something fighting the user's pan
    // every animation frame). Clearing the violation deliberately does NOT
    // reverse this: only activation recenters the camera, so a user who
    // pans away after the zoom doesn't get snapped back on Clear.
    if (zoomRef.current) {
      const svgEl = svgRef.current;
      const W = svgEl?.parentElement?.clientWidth  ?? 800;
      const H = svgEl?.parentElement?.clientHeight ?? 600;
      fitToPath(svg as d3.Selection<SVGSVGElement, unknown, null, undefined>, zoomRef.current, nodesRef.current, activePathIds, W, H);
    }

    // Dim every edge/node not on the path; the path itself stays fully lit
    // (color is handled separately below, per pulse line and per ring).
    edgeSel.attr("opacity", d => {
      const s = (d.source as D3Node).id, t = (d.target as D3Node).id;
      const onPath = activePathPairs.some(([a, b]) => (a === s && b === t) || (a === t && b === s));
      return onPath ? 0.18 : 0.06; // path's real edge stays faint; the pulse overlay carries the emphasis
    });
    nodeSel.attr("opacity", (n: D3Node) => activePathIds.has(n.id) ? 1 : 0.15);

    // Ring the path nodes in the severity color.
    nodeSel.each(function (n: D3Node) {
      const onPath = activePathIds.has(n.id);
      const isEndpoint = n.id === activeViolation.sourceNode || n.id === activeViolation.sinkNode;
      d3.select(this).select<SVGCircleElement>("circle.violation-ring")
        .attr("r", onPath ? (isEndpoint ? 17 : 13) : 0)
        .attr("stroke", sevColor)
        .attr("opacity", onPath ? 0.9 : 0);
    });

    // Taint badges on sourceNode / sinkNode only (that's where taint enters
    // / lands — mirrors how the violation is actually described).
    nodeSel.each(function (n: D3Node) {
      const group = d3.select(this).select<SVGGElement>("g.taint-badges");
      group.selectAll("*").remove();
      const isEndpoint = n.id === activeViolation.sourceNode || n.id === activeViolation.sinkNode;
      if (!isEndpoint) return;
      const types = activeViolation.taintTypes;
      const spacing = 13;
      const startX = -((types.length - 1) * spacing) / 2;
      types.forEach((t, i) => {
        const color = TAINT_COLOR[t] ?? TAINT_FALLBACK;
        const bx = startX + i * spacing;
        group.append("circle")
          .attr("cx", bx).attr("cy", 0).attr("r", 5)
          .attr("fill", color).attr("stroke", "#fff").attr("stroke-width", 1.2);
        group.append("text")
          .attr("x", bx).attr("y", -9)
          .attr("text-anchor", "middle")
          .attr("font-size", 8.5)
          .attr("font-family", "inherit")
          .attr("fill", color)
          .text(t);
      });
    });

    // Build one pulse-carrying <line> per path edge that actually exists in
    // the current link set (a violation's path can reference nodes that got
    // filtered out under "Key nodes" mode — those pairs are silently
    // skipped rather than throwing).
    const pathLinks = linksRef.current.filter(l => {
      const s = (l.source as D3Node).id ?? (l.source as unknown as string);
      const t = (l.target as D3Node).id ?? (l.target as unknown as string);
      return activePathPairs.some(([a, b]) => (a === s && b === t) || (a === t && b === s));
    });

    if (pathLinks.length === 0 || !pulseG) return;

    const pulseLines = pulseG.selectAll<SVGLineElement, D3Link>("line")
      .data(pathLinks)
      .join("line")
      .attr("stroke", sevColor)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.95)
      .attr("stroke-dasharray", "10,18")
      // Paint real endpoints right away rather than waiting for the sim's
      // tick handler to do it. The sim only calls that handler while it's
      // actively cooling (alpha above its stop threshold); once it settles,
      // ticks stop firing entirely and these lines would otherwise sit at
      // SVG's default x1=y1=x2=y2=0 — a zero-length line pinned at the
      // origin — until something incidental (dragging any node) nudges
      // alpha back up and resumes ticking. That's the "doesn't show up
      // until I move a node" bug: it was never about z-order or opacity,
      // the coordinates simply hadn't been written yet.
      .attr("x1", d => (d.source as D3Node).x ?? 0)
      .attr("y1", d => (d.source as D3Node).y ?? 0)
      .attr("x2", d => (d.target as D3Node).x ?? 0)
      .attr("y2", d => (d.target as D3Node).y ?? 0);

    // Manual rAF loop rather than SMIL <animate>: lets the dash phase move
    // at a constant visual speed regardless of each edge's on-screen length
    // (which changes continuously since the sim / zoom keep moving nodes),
    // and gives an easing pulse instead of a flat linear crawl.
    const start = performance.now();
    const speed = 46; // px / second of dash-phase travel
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const phase = -((elapsed * speed) % 28); // 28 = dash(10) + gap(18)
      pulseLines.attr("stroke-dashoffset", phase);
      // gentle opacity breathing so the pulse reads as "alive" even on
      // very short edges where dash motion alone is hard to perceive
      const breath = 0.75 + 0.25 * Math.sin(elapsed * 2.4);
      pulseLines.attr("opacity", breath);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [activeViolation, activePathIds, activePathPairs]);

  // Stops a pending sequence timer specifically on unmount. The rebuild
  // effect above already calls stopSequence on activeElements/mode
  // changes, but that effect only fires on dependency change, not on
  // unmount — this is the one that actually clears setTimeout if the
  // component goes away mid-sequence.
  useEffect(() => {
    return () => {
      if (sequenceTimerRef.current != null) clearTimeout(sequenceTimerRef.current);
    };
  }, []);

  // Called by the violations panel on a manual row click. Clicking the
  // already-active violation clears it (toggle), matching how `selected`
  // node click-to-isolate works. A manual click always wins over a running
  // sequence — it stops the timer first, so auto-play doesn't overwrite
  // the user's choice on its next scheduled step a moment later.
  const runViolation = useCallback((v: Violation) => {
    if (sequenceRunning) stopSequence();
    setSelected(null);
    setActiveViolation(prev => (prev?.ruleId === v.ruleId && prev?.sourceNode === v.sourceNode ? null : v));
  }, [sequenceRunning, stopSequence]);

  // What the panel actually renders: the accumulating list once anything
  // has been revealed (or while a sequence is mid-run), otherwise the full
  // violations array so the panel isn't empty on first load before
  // "Animate all" has ever been pressed.
  const panelViolations = revealedViolations.length > 0 || sequenceRunning
    ? revealedViolations
    : violations;

  return (
    <div className="relative w-full h-full bg-[#fafaf8] overflow-hidden">

      {/* Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-white border border-stone-200 rounded-lg p-0.5 shadow-sm">
          {(["links", "cluster"] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                mode === m ? "bg-stone-900 text-white shadow-sm" : "text-stone-400 hover:text-stone-700"
              }`}
            >
              {m === "links" ? "Links" : "Cluster"}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-stone-200" />

        <div className="flex items-center bg-white border border-stone-200 rounded-lg p-0.5 shadow-sm">
          {([true, false] as const).map(v => (
            <button key={String(v)} onClick={() => setShowAll(v)}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                showAll === v ? "bg-stone-900 text-white shadow-sm" : "text-stone-400 hover:text-stone-700"
              }`}
            >
              {v ? "All" : "Key nodes"}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-stone-200" />

        <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-1.5 shadow-sm">
          <span className="text-[11px] text-stone-400 select-none">Distance</span>
          <input type="range" min={60} max={600} step={10} value={distance}
            onChange={e => setDistance(Number(e.target.value))}
            className="w-24 accent-stone-400 cursor-pointer" />
          <span className="text-[11px] font-mono text-stone-500 w-8 text-right tabular-nums">{distance}</span>
        </div>

        {mode === "cluster" && (
          <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-1.5 shadow-sm">
            <span className="text-[11px] text-stone-400 select-none">Pull</span>
            <input type="range" min={1} max={100} step={1} value={strength}
              onChange={e => setStrength(Number(e.target.value))}
              className="w-20 accent-stone-400 cursor-pointer" />
            <span className="text-[11px] font-mono text-stone-500 w-6 text-right tabular-nums">{strength}</span>
          </div>
        )}

        <div className="w-px h-5 bg-stone-200" />

        <button
          onClick={() => simRef.current?.alpha(0.6).restart()}
          className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 hover:text-stone-800 transition-colors shadow-sm"
        >
          Reheat
        </button>

        {violations.length > 0 && (
          <>
            <div className="w-px h-5 bg-stone-200" />
            <button
              onClick={() => setPanelOpen(p => !p)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors shadow-sm flex items-center gap-1.5 ${
                panelOpen ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
              }`}
            >
              Violations
              <span className={`text-[10px] px-1.5 rounded-full ${panelOpen ? "bg-white/20" : "bg-stone-100 text-stone-500"}`}>
                {violations.length}
              </span>
            </button>

            <button
              onClick={toggleSequence}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors shadow-sm flex items-center gap-1.5 ${
                sequenceRunning
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50 hover:text-stone-800"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sequenceRunning ? "bg-white animate-pulse" : "bg-stone-300"}`}
              />
              {sequenceRunning ? "Animating…" : "Animate all"}
            </button>
          </>
        )}

        <span className="text-[11px] text-stone-400 ml-auto">
          {nodeCount.nodes} nodes · {nodeCount.edges} edges
          {selected && !activeViolation && <span className="ml-2 text-blue-400 font-mono">{selected}</span>}
        </span>
      </div>

      <svg ref={svgRef} className="w-full h-full" />

      {/* Violations panel */}
      {panelOpen && violations.length > 0 && (
        <div className="absolute top-14 right-3 z-10 w-72 max-h-[60%] overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-sm">
          <div className="px-3 py-2 border-b border-stone-100 text-[11px] font-medium text-stone-500 flex items-center justify-between sticky top-0 bg-white">
            <span>
              Tainted-flow violations
              {sequenceRunning && (
                <span className="ml-1.5 text-stone-400 font-normal">
                  ({revealedViolations.length}/{violations.length})
                </span>
              )}
            </span>
            {activeViolation && !sequenceRunning && (
              <button
                onClick={() => setActiveViolation(null)}
                className="text-[10px] text-stone-400 hover:text-stone-700"
              >
                Clear
              </button>
            )}
            {sequenceRunning && (
              <button
                onClick={stopSequence}
                className="text-[10px] text-stone-400 hover:text-stone-700"
              >
                Stop
              </button>
            )}
          </div>
          <ul className="divide-y divide-stone-100">
            {panelViolations.map((v, i) => {
              const isActive = activeViolation?.ruleId === v.ruleId
                && activeViolation?.sourceNode === v.sourceNode
                && activeViolation?.sinkNode === v.sinkNode;
              const sevColor = SEVERITY_COLOR[v.severity] ?? SEVERITY_COLOR.Low;
              return (
                <li key={`${v.ruleId}-${v.sourceNode}-${v.sinkNode}-${i}`}>
                  <button
                    onClick={() => runViolation(v)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${isActive ? "bg-stone-50" : "hover:bg-stone-50/60"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: sevColor }}
                      />
                      <span className="text-[11px] font-mono text-stone-600">{v.ruleId}</span>
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: sevColor }}>
                        {v.severity}
                      </span>
                      <span className="ml-auto flex gap-1">
                        {v.taintTypes.map(t => (
                          <span
                            key={t}
                            className="text-[9px] px-1 py-0.5 rounded"
                            style={{
                              color: TAINT_COLOR[t] ?? TAINT_FALLBACK,
                              background: (TAINT_COLOR[t] ?? TAINT_FALLBACK) + "1a",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    </div>
                    <div className="mt-1 text-[10.5px] font-mono text-stone-400 truncate">
                      {v.sourceNode.split("::").pop()} → {v.sinkNode.split("::").pop()}
                    </div>
                    {isActive && (
                      <div className="mt-1.5 text-[10.5px] text-stone-500 leading-snug">
                        {v.suggestion}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-4 bg-white border border-stone-200 rounded-xl px-4 py-2 shadow-sm">
        {[
          { color: "#86c9a0", label: "source" },
          { color: "#f4a4a4", label: "sink / log_sink" },
          { color: "#7ba7e8", label: "sanitizer" },
          { color: "#c9c6bf", label: "normal" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-[11px] text-stone-400">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-[2px] flex-shrink-0 rounded" style={{ background: "#c4b5f0" }} />
          <span className="text-[11px] text-stone-400">implicit</span>
        </div>
        {mode === "links" && !activeViolation && (
          <span className="text-[11px] text-stone-300">· click node to isolate</span>
        )}
        {activeViolation && (
          <span className="text-[11px]" style={{ color: SEVERITY_COLOR[activeViolation.severity] }}>
            · animating {activeViolation.ruleId} ({activeViolation.severity})
          </span>
        )}
      </div>
    </div>
  );
}
