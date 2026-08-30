import React from "react";
import { useGraphStore } from "@/stores/useGraphStore";
import type { Violation, Severity } from "@/types/graph";
import { useGenerateJsonReport, useGeneratePdfReport } from "@/api/report";
import { useSettingsStore } from "@/stores/useSettingsStore";

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

interface ViolationListProps {
  violations: Violation[];
  onRunViolation: (v: Violation) => void;
  onStopSequence: () => void;
  onCancelFadeOut: () => void;
}

export const ViolationList: React.FC<ViolationListProps> = ({
  violations,
  onRunViolation,
  onStopSequence,
  onCancelFadeOut,
}) => {
  const {
    panelOpen,
    sequenceRunning,
    revealedViolations,
    activeViolation,
    setActiveViolation,
  } = useGraphStore();
  const { branch, projectId, commitId } = useSettingsStore();

  const jsonMutation = useGenerateJsonReport();
  const pdfMutation = useGeneratePdfReport();

  if (!panelOpen || violations.length === 0) return null;

  const panelViolations =
    revealedViolations.length > 0 || sequenceRunning
      ? revealedViolations
      : violations;

  const handleDownloadJson = () => {
    jsonMutation.mutate(
      {
        projectId: projectId || "default-project",
        commitId: commitId || "main",
        violations,
      },
      {
        onSuccess: (data) => {
          const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `compliance_report_${(projectId || "project").slice(0, 8)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
        },
      },
    );
  };

  const handleDownloadPdf = () => {
    pdfMutation.mutate({
      projectId: projectId || "default-project",
      commitId: commitId || "main",
      violations,
    });
  };

  return (
    <div className="absolute top-14 right-3 z-10 w-72 max-h-[60%] flex flex-col bg-white border border-stone-200 rounded-xl shadow-sm">
      {/* Header */}
      <div className="px-3 py-2 border-b border-stone-100 text-[11px] font-medium text-stone-500 flex items-center justify-between sticky top-0 bg-white rounded-t-xl z-10">
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
            onClick={() => {
              onCancelFadeOut();
              setActiveViolation(null);
            }}
            className="text-[10px] text-stone-400 hover:text-stone-700"
          >
            Clear
          </button>
        )}
        {sequenceRunning && (
          <button
            onClick={onStopSequence}
            className="text-[10px] text-stone-400 hover:text-stone-700"
          >
            Stop
          </button>
        )}
      </div>

      {/* Violation List Scroll Area */}
      <ul className="divide-y divide-stone-100 overflow-y-auto flex-1">
        {panelViolations.map((v, i) => {
          const isActive =
            activeViolation?.ruleId === v.ruleId &&
            activeViolation?.sourceNode === v.sourceNode &&
            activeViolation?.sinkNode === v.sinkNode;
          const sevColor = SEVERITY_COLOR[v.severity] ?? SEVERITY_COLOR.Low;
          return (
            <li key={`${v.ruleId}-${v.sourceNode}-${v.sinkNode}-${i}`}>
              <button
                onClick={() => onRunViolation(v)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${
                  isActive ? "bg-stone-50" : "hover:bg-stone-50/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: sevColor }}
                  />
                  <span className="text-[11px] font-mono text-stone-600">
                    {v.ruleId}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-wide"
                    style={{ color: sevColor }}
                  >
                    {v.severity}
                  </span>
                  <span className="ml-auto flex gap-1">
                    {v.taintTypes.map((t) => (
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
                  {v.sourceNode.split("::").pop()} →{" "}
                  {v.sinkNode.split("::").pop()}
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

      {/* Footer / Report Action Buttons */}
      <div className="p-2 border-t border-stone-100 sticky bottom-0 bg-white rounded-b-xl flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-stone-400 pl-1">
          Export
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleDownloadJson}
            disabled={jsonMutation.isPending}
            className="px-2 py-1 text-[10px] font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded transition-colors disabled:opacity-50"
          >
            {jsonMutation.isPending ? "..." : "JSON"}
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfMutation.isPending}
            className="px-2 py-1 text-[10px] font-medium text-white bg-stone-800 hover:bg-stone-900 rounded transition-colors disabled:opacity-50"
          >
            {pdfMutation.isPending ? "..." : "PDF"}
          </button>
        </div>
      </div>
    </div>
  );
};
