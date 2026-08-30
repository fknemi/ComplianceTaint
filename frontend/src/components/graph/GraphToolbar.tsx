import React from "react";
import { useGraphStore, Mode } from "@/stores/useGraphStore";

interface GraphToolbarProps {
  violationsCount: number;
  nodeCount: { nodes: number; edges: number };
  onToggleSequence: () => void;
}

export const GraphToolbar: React.FC<GraphToolbarProps> = ({
  violationsCount,
  nodeCount,
  onToggleSequence,
}) => {
  const {
    mode,
    setMode,
    showAll,
    setShowAll,
    distance,
    setDistance,
    strength,
    setStrength,
    selected,
    activeViolation,
    panelOpen,
    setPanelOpen,
    sequenceRunning,
    triggerReheat,
  } = useGraphStore();

  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2 flex-wrap">
      <div className="flex items-center bg-white border border-stone-200 rounded-lg p-0.5 shadow-sm">
        {(["links", "cluster"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
              mode === m
                ? "bg-stone-900 text-white shadow-sm"
                : "text-stone-400 hover:text-stone-700"
            }`}
          >
            {m === "links" ? "Links" : "Cluster"}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-stone-200" />

      <div className="flex items-center bg-white border border-stone-200 rounded-lg p-0.5 shadow-sm">
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            onClick={() => setShowAll(v)}
            className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
              showAll === v
                ? "bg-stone-900 text-white shadow-sm"
                : "text-stone-400 hover:text-stone-700"
            }`}
          >
            {v ? "All" : "Key nodes"}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-stone-200" />

      <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-1.5 shadow-sm">
        <span className="text-[11px] text-stone-400 select-none">Distance</span>
        <input
          type="range"
          min={60}
          max={600}
          step={10}
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
          className="w-24 accent-stone-400 cursor-pointer"
        />
        <span className="text-[11px] font-mono text-stone-500 w-8 text-right tabular-nums">
          {distance}
        </span>
      </div>

      {mode === "cluster" && (
        <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-1.5 shadow-sm">
          <span className="text-[11px] text-stone-400 select-none">Pull</span>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-20 accent-stone-400 cursor-pointer"
          />
          <span className="text-[11px] font-mono text-stone-500 w-6 text-right tabular-nums">
            {strength}
          </span>
        </div>
      )}

      <div className="w-px h-5 bg-stone-200" />

      <button
        onClick={triggerReheat}
        className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 hover:text-stone-800 transition-colors shadow-sm"
      >
        Reheat
      </button>

      {violationsCount > 0 && (
        <>
          <div className="w-px h-5 bg-stone-200" />
          <button
            onClick={() => setPanelOpen((p) => !p)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors shadow-sm flex items-center gap-1.5 ${
              panelOpen
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
            }`}
          >
            Violations
            <span
              className={`text-[10px] px-1.5 rounded-full ${panelOpen ? "bg-white/20" : "bg-stone-100 text-stone-500"}`}
            >
              {violationsCount}
            </span>
          </button>
        </>
      )}
    </div>
  );
};
