import GraphView from "@/components/graph/GraphView";
import { useGraphStore } from "@/stores/useGraphStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useGraph } from "@/api/graph";
import { useAuditStore } from "@/stores/useAuditStore";

export default function GraphPage() {
  const { elements = [], setElements } = useGraphStore();
  const { projectId, branch, commitId, apiKey } = useSettingsStore();
  const { violations } = useAuditStore();

  const { refetch, isFetching, isError, error } = useGraph(
    { projectId, branch, commitId, apiKey },
    {
      enabled: false, // never fetch automatically
    },
  );

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.data?.elements) {
      setElements(result.data.elements);
    }
  };

  if (!projectId) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400 h-full w-full bg-[#fafaf8]">
        Add your Project ID in settings to load the graph.
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-full w-full relative bg-[#fafaf8]">
      {isError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 text-red-500 text-sm px-4 py-2 rounded-lg border border-red-200 shadow-sm">
          {error?.message ?? "Failed to load graph."}
        </div>
      )}

      {elements.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-gray-400 w-full h-full">
          No graph data yet — Click Refresh Graph to Load or Run Audit
        </div>
      ) : (
        <GraphView elements={elements} violations={violations} />
      )}

      {/* 
        Refresh button 
        - Moved to bottom-4 to prevent overlap with the top GraphToolbar
        - z-50 guarantees it sits above the graph canvas 
        - Rendered last in DOM to prevent stacking context issues
      */}
      <div className="absolute bottom-4 right-4 z-50">
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="border border-[#B9B9B9]/50 bg-white px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors text-gray-700 font-medium"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={14}
            height={14}
            fill="#000000"
            viewBox="0 0 256 256"
          >
            <path d="M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h28.69L182.06,73.37a79.56,79.56,0,0,0-56.13-23.43h-.45A79.52,79.52,0,0,0,69.59,72.71,8,8,0,0,1,58.41,61.27a96,96,0,0,1,135,.79L208,76.69V48a8,8,0,0,1,16,0ZM186.41,183.29a80,80,0,0,1-112.47-.66L59.31,168H88a8,8,0,0,0,0-16H40a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V179.31l14.63,14.63A95.43,95.43,0,0,0,130,222.06h.53a95.36,95.36,0,0,0,67.07-27.33,8,8,0,0,0-11.18-11.44Z" />
          </svg>

          {isFetching ? "Loading..." : "Refresh Graph"}
        </button>
      </div>
    </div>
  );
}
