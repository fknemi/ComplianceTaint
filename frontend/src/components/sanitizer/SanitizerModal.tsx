import React, { useState, useEffect } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useGraphStore } from "@/stores/useGraphStore";
import { useSanitize } from "@/api/sanitize"; // Adjust path if you saved the hook elsewhere

export default function SanitizerModal({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore();
  
  // Grab both the selected ID and the raw elements array from the store
  const { selected, elements = [] } = useGraphStore();
  
  // Filter out edges so we only map over the nodes for the dropdown
  const graphNodes = elements.filter((el) => el.type !== "edge");
  
  const [nodeId, setNodeId] = useState(selected || "");
  const [sanitizerType, setSanitizerType] = useState("");

  const { mutate: applySanitizer, data, isPending, isError, error } = useSanitize();

  // Keep input synced if user clicks a different node while modal is opening
  useEffect(() => {
    if (selected) setNodeId(selected);
  }, [selected]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!nodeId || !settings.projectId) return;

    applySanitizer({
      nodeId,
      projectId: settings.projectId,
      branch: settings.branch,
      commitId: settings.commitId,
      apiKey: settings.apiKey,
      sanitizerType: sanitizerType || undefined, // send undefined if empty
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col border border-gray-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Node Sanitizer</h2>
            <p className="text-xs text-gray-500 mt-1">Analyze nodes for vulnerabilities and apply sanitation rules</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors bg-white hover:bg-gray-100 p-1.5 rounded-md border border-transparent hover:border-gray-200"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">
              Target Node ID <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select 
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value)}
                className="w-full p-3 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-[13px] text-gray-800 bg-white appearance-none cursor-pointer truncate"
                required
              >
                <option value="" disabled>-- Select a node from the graph --</option>
                {graphNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.id}
                  </option>
                ))}
              </select>
              {/* Custom Chevron for the select dropdown */}
              <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
            {!nodeId && !selected && (
              <p className="text-[11px] text-gray-500">Tip: Click a node in the graph before opening this tool to auto-fill.</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">
              Sanitizer Capability (Optional)
            </label>
            <input 
              value={sanitizerType}
              onChange={(e) => setSanitizerType(e.target.value)}
              placeholder="e.g., maskPII, hashPassword"
              className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-[13px] text-gray-800 placeholder:text-gray-400"
            />
            <p className="text-[11px] text-gray-500">Leave blank to get a recommendation based on the node's taint types.</p>
          </div>

          {/* Results Area */}
          <div className="min-h-[100px]">
            {isPending && (
              <div className="h-full p-4 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center gap-3 text-gray-500 text-sm">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Analyzing node topology...
              </div>
            )}

            {isError && (
              <div className="h-full p-4 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="font-medium">{error?.message || "Failed to analyze node. Check Project ID."}</div>
              </div>
            )}

            {data && !isPending && (
              <div className={`h-full p-5 border rounded-lg flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200 ${
                data.status === 'success' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    data.status === 'success' ? 'bg-green-200 text-green-800' : 'bg-blue-200 text-blue-800'
                  }`}>
                    {data.status}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 capitalize">Role: {data.role}</span>
                </div>
                
                <p className="text-sm text-gray-700 leading-relaxed">{data.message}</p>
                
                {data.recommendedSanitizer && !sanitizerType && (
                  <div className="mt-1 pt-3 border-t border-black/5 text-sm text-gray-700 flex items-center gap-2">
                    <span className="font-semibold">Recommendation:</span> 
                    <code className="bg-white px-2 py-1 rounded border border-gray-200 font-mono text-pink-600 font-medium shadow-sm">
                      {data.recommendedSanitizer}
                    </code>
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
          >
            Cancel
          </button>
          <button 
            onClick={() => handleSubmit()}
            disabled={isPending || !nodeId || !settings.projectId}
            className="px-6 py-2 bg-[#111111] text-white hover:bg-black disabled:opacity-50 disabled:hover:bg-[#111111] rounded-lg transition-colors font-medium shadow-sm flex items-center gap-2 text-sm"
          >
            {isPending ? "Processing..." : sanitizerType ? "Apply Sanitizer" : "Analyze Node"}
          </button>
        </div>
      </div>
    </div>
  );
}
