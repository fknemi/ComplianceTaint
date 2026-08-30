import * as d3 from "d3";
import type { GraphElement, GraphNode, GraphEdge } from "@/types/graph";
import type { Violation, Severity } from "@/types/graph";
import { useGraphStore } from "@/stores/useGraphStore";
import { GraphToolbar } from "./GraphToolbar";
import { ViolationList } from "./ViolationList";
import { useEffect, useRef, useMemo, useCallback, useState } from "react";
const ROLE_COLOR: Record<string, string> = {
  source: "#86c9a0",
  sink: "#f4a4a4",
  log_sink: "#f4a4a4",
  sanitizer: "#7ba7e8",
  normal: "#c9c6bf",
};
const ROLE_STROKE: Record<string, string> = {
  source: "#5aaf7a",
  sink: "#e07070",
  log_sink: "#e07070",
  sanitizer: "#4d84cc",
  normal: "#a8a49d",
};
const IMPORTANT = new Set(["source", "sink", "sanitizer", "log_sink"]);

const ROLE_CENTERS: Record<string, { cx: number; cy: number }> = {
  source: { cx: 0.2, cy: 0.3 },
  sink: { cx: 0.8, cy: 0.7 },
  log_sink: { cx: 0.8, cy: 0.3 },
  sanitizer: { cx: 0.5, cy: 0.15 },
  normal: { cx: 0.5, cy: 0.55 },
};

const SEVERITY_COLOR: Record<Severity, string> = {
  Critical: "#e0708a",
  High: "#e0a15c",
  Medium: "#d6c15a",
  Low: "#9bb6d6",
};

const TAINT_COLOR: Record<string, string> = {
  pci: "#c2618a",
  secret: "#8a5cc2",
  pii: "#5c8ac2",
};
const TAINT_FALLBACK = "#a8a49d";

const SEQUENCE_STEP_MS = 2200;
const SEQUENCE_END_FADE_MS = 2000;

function getNodes(els: GraphElement[]): GraphNode[] {
  return els.filter((e): e is GraphNode => e.type !== "edge");
}
function getEdges(els: GraphElement[]): GraphEdge[] {
  return els.filter((e): e is GraphEdge => e.type === "edge");
}

interface D3Node extends GraphNode, d3.SimulationNodeDatum {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}
interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  edge_type: string;
  data_flow_type: string;
}

function repositionBubbles(
  bubblesG: d3.Selection<SVGGElement, unknown, null, undefined>,
  nodes: D3Node[],
  W: number,
  H: number,
) {
  const byRole: Record<string, D3Node[]> = {};
  nodes.forEach((n) => {
    if (!byRole[n.role]) byRole[n.role] = [];
    byRole[n.role].push(n);
  });

  bubblesG.selectAll("*").remove();

  Object.entries(byRole).forEach(([role, rNodes]) => {
    const xs = rNodes.map((n) => n.x ?? W / 2);
    const ys = rNodes.map((n) => n.y ?? H / 2);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const maxDist = Math.max(
      ...rNodes.map((n) => Math.hypot((n.x ?? cx) - cx, (n.y ?? cy) - cy)),
    );
    const r = Math.max(48, maxDist + 32);

    bubblesG
      .append("circle")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", r)
      .attr("fill", ROLE_COLOR[role] + "0d")
      .attr("stroke", ROLE_COLOR[role] + "55")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "6,4");

    bubblesG
      .append("text")
      .attr("x", cx)
      .attr("y", cy - r - 7)
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("fill", ROLE_STROKE[role])
      .attr("opacity", 0.7)
      .attr("font-family", "inherit")
      .text(role.replace("_", " ").toUpperCase());
  });
}

function fitToPath(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  zoom: d3.ZoomBehavior<SVGSVGElement, unknown>,
  nodes: D3Node[],
  pathIds: Set<string>,
  W: number,
  H: number,
) {
  const pathNodes = nodes.filter(
    (n) => pathIds.has(n.id) && n.x != null && n.y != null,
  );
  if (pathNodes.length < 2) return;

  const xs = pathNodes.map((n) => n.x as number);
  const ys = pathNodes.map((n) => n.y as number);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);

  const PAD = 120;
  const boxW = Math.max(maxX - minX + PAD * 2, 1);
  const boxH = Math.max(maxY - minY + PAD * 2, 1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const rawScale = Math.min(W / boxW, H / boxH);
  const scale = Math.min(Math.max(rawScale, 0.4), 2.5);

  const transform = d3.zoomIdentity
    .translate(W / 2, H / 2)
    .scale(scale)
    .translate(-cx, -cy);

  svg
    .transition()
    .duration(750)
    .ease(d3.easeCubicInOut)
    .call(zoom.transform, transform);
}

interface GraphViewProps {
  elements: GraphElement[];
  violations?: Violation[];
}

export default function GraphView({
  elements,
  violations = [],
}: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<D3Node, D3Link> | null>(null);
  const linkForceRef = useRef<d3.ForceLink<D3Node, D3Link> | null>(null);
  const bubblesGRef = useRef<d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > | null>(null);
  const nodesRef = useRef<D3Node[]>([]);
  const linksRef = useRef<D3Link[]>([]);
  const nodeElRef = useRef<d3.Selection<
    SVGGElement,
    D3Node,
    SVGGElement,
    unknown
  > | null>(null);
  const pulseGRef = useRef<d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const rafRef = useRef<number | null>(null);
  const builtRef = useRef(false);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    mode,
    showAll,
    distance,
    strength,
    selected,
    setSelected,
    activeViolation,
    setActiveViolation,
    sequenceRunning,
    setSequenceRunning,
    revealedViolations,
    setRevealedViolations,
    reheatTrigger,
    animateTrigger,
  } = useGraphStore();

  const [nodeCount, setNodeCount] = useState({ nodes: 0, edges: 0 });
  const sequenceIndexRef = useRef(0);
  const advanceSequenceRef = useRef<() => void>(() => {});

  const activeElements = useMemo(() => {
    if (showAll) return elements;
    const nodes = getNodes(elements);
    const edges = getEdges(elements);
    const impIds = new Set(
      nodes.filter((n) => IMPORTANT.has(n.role)).map((n) => n.id),
    );
    const relEdges = edges.filter(
      (e) => impIds.has(e.source) && impIds.has(e.target),
    );
    const nbIds = new Set(relEdges.flatMap((e) => [e.source, e.target]));
    return [
      ...nodes.filter((n) => impIds.has(n.id) || nbIds.has(n.id)),
      ...relEdges,
    ] as GraphElement[];
  }, [elements, showAll]);

  const activeElementsSignature = useMemo(() => {
    const nodeIds = getNodes(activeElements)
      .map((n) => n.id)
      .sort();
    const edgeKeys = getEdges(activeElements)
      .map((e) => `${e.source}>${e.target}`)
      .sort();
    return nodeIds.join(",") + "|" + edgeKeys.join(",");
  }, [activeElements]);

  const activePathIds = useMemo(
    () => new Set(activeViolation?.path ?? []),
    [activeViolation],
  );
  const activePathPairs = useMemo(() => {
    const p = activeViolation?.path ?? [];
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < p.length - 1; i++) pairs.push([p[i], p[i + 1]]);
    return pairs;
  }, [activeViolation]);

  const cancelFadeOut = useCallback(() => {
    if (fadeOutTimerRef.current != null) {
      clearTimeout(fadeOutTimerRef.current);
      fadeOutTimerRef.current = null;
    }
  }, []);

  const stopSequence = useCallback(() => {
    if (sequenceTimerRef.current != null) {
      clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }
    setSequenceRunning(false);
  }, [setSequenceRunning]);

  const advanceSequence = useCallback(() => {
    const i = sequenceIndexRef.current;
    if (i >= violations.length) {
      stopSequence();
      if (fadeOutTimerRef.current != null)
        clearTimeout(fadeOutTimerRef.current);
      fadeOutTimerRef.current = setTimeout(() => {
        setActiveViolation(null);
        fadeOutTimerRef.current = null;
      }, SEQUENCE_END_FADE_MS);
      return;
    }
    const v = violations[i];
    setActiveViolation(v);
    setRevealedViolations((prev) => [...prev, v]);
    sequenceIndexRef.current = i + 1;
    sequenceTimerRef.current = setTimeout(
      () => advanceSequenceRef.current(),
      SEQUENCE_STEP_MS,
    );
  }, [violations, stopSequence, setActiveViolation, setRevealedViolations]);

  useEffect(() => {
    advanceSequenceRef.current = advanceSequence;
  }, [advanceSequence]);

  const toggleSequence = useCallback(() => {
    if (sequenceRunning) {
      stopSequence();
      return;
    }
    cancelFadeOut();
    setSelected(null);
    sequenceIndexRef.current = 0;
    setRevealedViolations([]);
    setSequenceRunning(true);
    advanceSequenceRef.current();
  }, [
    sequenceRunning,
    stopSequence,
    cancelFadeOut,
    setSelected,
    setRevealedViolations,
    setSequenceRunning,
  ]);

  // Handle manual Reheat triggers from the store
  useEffect(() => {
    if (reheatTrigger > 0) {
      simRef.current?.alpha(0.6).restart();
    }
  }, [reheatTrigger]);
  const lastAnimateRef = useRef(animateTrigger);
  useEffect(() => {
    if (animateTrigger > lastAnimateRef.current) {
      lastAnimateRef.current = animateTrigger;
      toggleSequence();
    }
  }, [animateTrigger, toggleSequence]);
  useEffect(() => {
    if (!builtRef.current) return;
    linkForceRef.current?.distance(distance);
    simRef.current?.alpha(0.3).restart();
  }, [distance]);

  useEffect(() => {
    if (!builtRef.current || mode !== "cluster") return;
    const pull = strength / 100;
    const W = svgRef.current?.parentElement?.clientWidth ?? 800;
    const H = svgRef.current?.parentElement?.clientHeight ?? 600;
    simRef.current?.force(
      "cx",
      d3
        .forceX<D3Node>()
        .x((d) => (ROLE_CENTERS[d.role]?.cx ?? 0.5) * W)
        .strength(pull),
    );
    simRef.current?.force(
      "cy",
      d3
        .forceY<D3Node>()
        .y((d) => (ROLE_CENTERS[d.role]?.cy ?? 0.5) * H)
        .strength(pull),
    );
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
      defs
        .append("marker")
        .attr("id", id)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("refX", 5)
        .attr("refY", 3)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,0 L0,6 L6,3 z")
        .attr("fill", fill);
    mkArrow("arr-primary", "#d4d1cb");
    mkArrow("arr-implicit", "#c4b5f0");
    mkArrow("arr-active", "#7ba7e8");

    const root = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 5])
      .on("zoom", (e) => root.attr("transform", e.transform));
    svg.call(zoom);
    zoomRef.current = zoom;
    svg.on("click", (e) => {
      if (e.target === svgEl || (e.target as Element).tagName === "svg")
        setSelected(null);
    });

    const bubblesG = root.append("g").attr("class", "bubbles");
    bubblesGRef.current = bubblesG;

    const rawNodes = getNodes(activeElements);
    const rawEdges = getEdges(activeElements);
    const nodeMap = new Map(rawNodes.map((n) => [n.id, n]));
    setNodeCount({ nodes: rawNodes.length, edges: rawEdges.length });

    const nodes: D3Node[] = rawNodes.map((n) => ({ ...n }));
    nodesRef.current = nodes;

    const links: D3Link[] = rawEdges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        edge_type: e.edge_type,
        data_flow_type: e.data_flow_type,
      }));
    linksRef.current = links;

    const pull = strength / 100;

    const linkForce = d3
      .forceLink<D3Node, D3Link>(links)
      .id((d) => d.id)
      .distance(distance)
      .strength(mode === "cluster" ? 0.15 : 0.4);
    linkForceRef.current = linkForce;

    const sim = d3
      .forceSimulation<D3Node>(nodes)
      .force("link", linkForce)
      .force(
        "charge",
        d3
          .forceManyBody()
          .strength(mode === "cluster" ? -320 : -1000)
          .distanceMax(700),
      )
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(mode === "cluster" ? 32 : 44));

    if (mode === "cluster") {
      sim
        .force(
          "cx",
          d3
            .forceX<D3Node>()
            .x((d) => (ROLE_CENTERS[d.role]?.cx ?? 0.5) * W)
            .strength(pull),
        )
        .force(
          "cy",
          d3
            .forceY<D3Node>()
            .y((d) => (ROLE_CENTERS[d.role]?.cy ?? 0.5) * H)
            .strength(pull),
        );
    } else {
      sim
        .force("cx", d3.forceX(W / 2).strength(0.02))
        .force("cy", d3.forceY(H / 2).strength(0.02));
    }

    simRef.current = sim;
    builtRef.current = true;

    const edgeEl = root
      .append("g")
      .selectAll<SVGLineElement, D3Link>("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) =>
        d.edge_type === "implicit" ? "#c4b5f0" : "#d4d1cb",
      )
      .attr("stroke-width", (d) => (d.edge_type === "implicit" ? 1.5 : 1.2))
      .attr("stroke-dasharray", (d) =>
        d.edge_type === "implicit" ? "5,4" : null,
      )
      .attr("opacity", 0.65)
      .attr("marker-end", (d) =>
        d.edge_type === "implicit" ? "url(#arr-implicit)" : "url(#arr-primary)",
      );

    const pulseG = root
      .append("g")
      .attr("class", "violation-pulses")
      .style("pointer-events", "none");
    pulseGRef.current = pulseG;

    const nodeEl = root
      .append("g")
      .attr("class", "graph-nodes")
      .selectAll<SVGGElement, D3Node>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, D3Node>()
          .on("start", (ev, d) => {
            if (!ev.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (ev, d) => {
            d.fx = ev.x;
            d.fy = ev.y;
          })
          .on("end", (ev, d) => {
            if (!ev.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      )
      .on("click", (ev, d) => {
        ev.stopPropagation();
        setSelected((prev) => (prev === d.id ? null : d.id));
      });
    nodeElRef.current = nodeEl;

    nodeEl
      .filter((d) => IMPORTANT.has(d.role))
      .append("circle")
      .attr("class", "role-halo")
      .attr("r", 15)
      .attr("fill", (d) => ROLE_COLOR[d.role] + "1a")
      .attr("stroke", (d) => ROLE_COLOR[d.role] + "55")
      .attr("stroke-width", 1);

    nodeEl
      .append("circle")
      .attr("class", "violation-ring")
      .attr("r", 0)
      .attr("fill", "none")
      .attr("stroke-width", 2.5)
      .attr("opacity", 0);

    nodeEl
      .append("circle")
      .attr("class", "role-dot")
      .attr("r", (d) => (IMPORTANT.has(d.role) ? 9 : 5))
      .attr("fill", (d) => ROLE_COLOR[d.role] ?? ROLE_COLOR.normal)
      .attr("stroke", (d) => ROLE_STROKE[d.role] ?? ROLE_STROKE.normal)
      .attr("stroke-width", (d) => (IMPORTANT.has(d.role) ? 2 : 1.5));

    nodeEl
      .append("text")
      .attr("dy", (d) => (IMPORTANT.has(d.role) ? 15 : 5) + 13)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", "#9b9890")
      .attr("font-family", "'SF Mono','Fira Code',monospace")
      .attr("pointer-events", "none")
      .text((d) => d.function);

    nodeEl
      .append("g")
      .attr("class", "taint-badges")
      .attr(
        "transform",
        (d) => `translate(0, ${-(IMPORTANT.has(d.role) ? 15 : 5) - 8})`,
      );

    let bubbleUpdateScheduled = false;

    sim.on("tick", () => {
      edgeEl
        .attr("x1", (d) => (d.source as D3Node).x ?? 0)
        .attr("y1", (d) => (d.source as D3Node).y ?? 0)
        .attr("x2", (d) => (d.target as D3Node).x ?? 0)
        .attr("y2", (d) => (d.target as D3Node).y ?? 0);
      nodeEl.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);

      pulseG
        .selectAll<SVGLineElement, D3Link>("line")
        .attr("x1", (d) => (d.source as D3Node).x ?? 0)
        .attr("y1", (d) => (d.source as D3Node).y ?? 0)
        .attr("x2", (d) => (d.target as D3Node).x ?? 0)
        .attr("y2", (d) => (d.target as D3Node).y ?? 0);

      if (mode === "cluster" && bubblesGRef.current) {
        if (!bubbleUpdateScheduled) {
          bubbleUpdateScheduled = true;
          requestAnimationFrame(() => {
            if (bubblesGRef.current)
              repositionBubbles(bubblesGRef.current, nodesRef.current, W, H);
            bubbleUpdateScheduled = false;
          });
        }
      }
    });

    sim.on("end", () => {
      if (mode === "cluster" && bubblesGRef.current) {
        repositionBubbles(bubblesGRef.current, nodesRef.current, W, H);
      }
    });
  }, [activeElements, mode, strength, distance, setSelected]);

  useEffect(() => {
    builtRef.current = false;
    buildGraph();
    return () => {
      simRef.current?.stop();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [buildGraph]);

  useEffect(() => {
    setActiveViolation(null);
    stopSequence();
    setRevealedViolations([]);
    cancelFadeOut();
  }, [
    activeElementsSignature,
    mode,
    stopSequence,
    cancelFadeOut,
    setActiveViolation,
    setRevealedViolations,
  ]);

  useEffect(() => {
    if (activeViolation) return;
    const svg = d3.select(svgRef.current!);
    const edgeEl = svg.selectAll<SVGLineElement, D3Link>(
      "g:not(.violation-pulses) > line",
    );
    const nodeEl = svg.selectAll<SVGGElement, D3Node>("g.graph-nodes > g");

    if (!selected) {
      edgeEl
        .attr("stroke", (d) =>
          d.edge_type === "implicit" ? "#c4b5f0" : "#d4d1cb",
        )
        .attr("opacity", 0.65)
        .attr("marker-end", (d) =>
          d.edge_type === "implicit"
            ? "url(#arr-implicit)"
            : "url(#arr-primary)",
        );
      nodeEl.attr("opacity", 1);
      return;
    }

    const allLinks = edgeEl.data();
    edgeEl
      .attr("stroke", (d) => {
        const s = (d.source as D3Node).id,
          t = (d.target as D3Node).id;
        return s === selected || t === selected
          ? "#7ba7e8"
          : d.edge_type === "implicit"
            ? "#c4b5f0"
            : "#d4d1cb";
      })
      .attr("opacity", (d) => {
        const s = (d.source as D3Node).id,
          t = (d.target as D3Node).id;
        return s === selected || t === selected ? 1 : 0.06;
      })
      .attr("marker-end", (d) => {
        const s = (d.source as D3Node).id,
          t = (d.target as D3Node).id;
        return s === selected || t === selected
          ? "url(#arr-active)"
          : d.edge_type === "implicit"
            ? "url(#arr-implicit)"
            : "url(#arr-primary)";
      });

    nodeEl.attr("opacity", (n: D3Node) => {
      if (n.id === selected) return 1;
      return allLinks.some(
        (l) =>
          ((l.source as D3Node).id === selected &&
            (l.target as D3Node).id === n.id) ||
          ((l.target as D3Node).id === selected &&
            (l.source as D3Node).id === n.id),
      )
        ? 1
        : 0.1;
    });
  }, [selected, activeViolation]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svg.node()) return;

    const edgeSel = svg.selectAll<SVGLineElement, D3Link>(
      "g:not(.violation-pulses) > line",
    );
    const nodeSel = svg.selectAll<SVGGElement, D3Node>("g.graph-nodes > g");
    const pulseG = pulseGRef.current;

    pulseG?.selectAll("*").remove();
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!activeViolation) {
      edgeSel
        .attr("stroke", (d) =>
          d.edge_type === "implicit" ? "#c4b5f0" : "#d4d1cb",
        )
        .attr("opacity", 0.65);
      nodeSel.attr("opacity", 1);
      nodeSel
        .select<SVGCircleElement>("circle.violation-ring")
        .attr("r", 0)
        .attr("opacity", 0);
      nodeSel.select<SVGGElement>("g.taint-badges").selectAll("*").remove();
      return;
    }

    const sevColor =
      SEVERITY_COLOR[activeViolation.severity] ?? SEVERITY_COLOR.Low;

    if (zoomRef.current) {
      const svgEl = svgRef.current;
      const W = svgEl?.parentElement?.clientWidth ?? 800;
      const H = svgEl?.parentElement?.clientHeight ?? 600;
      fitToPath(
        svg as d3.Selection<SVGSVGElement, unknown, null, undefined>,
        zoomRef.current,
        nodesRef.current,
        activePathIds,
        W,
        H,
      );
    }

    edgeSel.attr("opacity", (d) => {
      const s = (d.source as D3Node).id,
        t = (d.target as D3Node).id;
      const onPath = activePathPairs.some(
        ([a, b]) => (a === s && b === t) || (a === t && b === s),
      );
      return onPath ? 0.18 : 0.06;
    });
    nodeSel.attr("opacity", (n: D3Node) =>
      activePathIds.has(n.id) ? 1 : 0.15,
    );

    nodeSel.each(function (n: D3Node) {
      const onPath = activePathIds.has(n.id);
      const isEndpoint =
        n.id === activeViolation.sourceNode ||
        n.id === activeViolation.sinkNode;
      d3.select(this)
        .select<SVGCircleElement>("circle.violation-ring")
        .attr("r", onPath ? (isEndpoint ? 17 : 13) : 0)
        .attr("stroke", sevColor)
        .attr("opacity", onPath ? 0.9 : 0);
    });

    nodeSel.each(function (n: D3Node) {
      const group = d3.select(this).select<SVGGElement>("g.taint-badges");
      group.selectAll("*").remove();
      const isEndpoint =
        n.id === activeViolation.sourceNode ||
        n.id === activeViolation.sinkNode;
      if (!isEndpoint) return;
      const types = activeViolation.taintTypes;
      const spacing = 13;
      const startX = -((types.length - 1) * spacing) / 2;
      types.forEach((t, i) => {
        const color = TAINT_COLOR[t] ?? TAINT_FALLBACK;
        const bx = startX + i * spacing;
        group
          .append("circle")
          .attr("cx", bx)
          .attr("cy", 0)
          .attr("r", 5)
          .attr("fill", color)
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.2);
        group
          .append("text")
          .attr("x", bx)
          .attr("y", -9)
          .attr("text-anchor", "middle")
          .attr("font-size", 8.5)
          .attr("font-family", "inherit")
          .attr("fill", color)
          .text(t);
      });
    });

    const pathLinks = linksRef.current.filter((l) => {
      const s = (l.source as D3Node).id ?? (l.source as unknown as string);
      const t = (l.target as D3Node).id ?? (l.target as unknown as string);
      return activePathPairs.some(
        ([a, b]) => (a === s && b === t) || (a === t && b === s),
      );
    });

    if (pathLinks.length === 0 || !pulseG) return;

    const pulseLines = pulseG
      .selectAll<SVGLineElement, D3Link>("line")
      .data(pathLinks)
      .join("line")
      .attr("stroke", sevColor)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.95)
      .attr("stroke-dasharray", "10,18")
      .attr("x1", (d) => (d.source as D3Node).x ?? 0)
      .attr("y1", (d) => (d.source as D3Node).y ?? 0)
      .attr("x2", (d) => (d.target as D3Node).x ?? 0)
      .attr("y2", (d) => (d.target as D3Node).y ?? 0);

    const start = performance.now();
    const speed = 46;
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const phase = -((elapsed * speed) % 28);
      pulseLines.attr("stroke-dashoffset", phase);
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

  useEffect(() => {
    return () => {
      if (sequenceTimerRef.current != null)
        clearTimeout(sequenceTimerRef.current);
      if (fadeOutTimerRef.current != null)
        clearTimeout(fadeOutTimerRef.current);
    };
  }, []);

  const runViolation = useCallback(
    (v: Violation) => {
      if (sequenceRunning) stopSequence();
      cancelFadeOut();
      setSelected(null);
      setActiveViolation((prev) =>
        prev?.ruleId === v.ruleId && prev?.sourceNode === v.sourceNode
          ? null
          : v,
      );
    },
    [
      sequenceRunning,
      stopSequence,
      cancelFadeOut,
      setSelected,
      setActiveViolation,
    ],
  );

  return (
    <div className="relative w-full h-full bg-[#fafaf8] overflow-hidden">
      {/* Toolbar */}
      <GraphToolbar
        violationsCount={violations.length}
        nodeCount={nodeCount}
        onToggleSequence={toggleSequence}
      />

      <svg ref={svgRef} className="w-full h-full" />

      {/* Violations panel */}
      <ViolationList
        violations={violations}
        onRunViolation={runViolation}
        onStopSequence={stopSequence}
        onCancelFadeOut={cancelFadeOut}
      />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-4 bg-white border border-stone-200 rounded-xl px-4 py-2 shadow-sm">
        {[
          { color: "#86c9a0", label: "source" },
          { color: "#f4a4a4", label: "sink / log_sink" },
          { color: "#7ba7e8", label: "sanitizer" },
          { color: "#c9c6bf", label: "normal" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: color }}
            />
            <span className="text-[11px] text-stone-400">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-[2px] flex-shrink-0 rounded"
            style={{ background: "#c4b5f0" }}
          />
          <span className="text-[11px] text-stone-400">implicit</span>
        </div>
        {mode === "links" && !activeViolation && (
          <span className="text-[11px] text-stone-300">
            · click node to isolate
          </span>
        )}
        {activeViolation && (
          <span
            className="text-[11px]"
            style={{ color: SEVERITY_COLOR[activeViolation.severity] }}
          >
            · animating {activeViolation.ruleId} ({activeViolation.severity})
          </span>
        )}
      </div>
    </div>
  );
}
