import GraphView from "@/components/graph/GraphView";
import { useGraphStore } from "@/stores/useGraphStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useGraph } from "@/api/graph";
import type { Violation } from "@/types/graph"; // move to @/types/violation if you split it out

export default function GraphPage() {
  const { elements, setElements } = useGraphStore();
  const { projectId, branch, commitId, apiKey } = useSettingsStore();

  const { refetch, isFetching, isError, error } = useGraph(
    { projectId, branch, commitId, apiKey },
    {
      enabled: false, // never fetch automatically
    },
  );

  // TODO: this will presumably come from useGraph()'s response (or a
  // sibling query) once the backend returns violations alongside elements.
  // Left as a local const for now, matching how it arrived — just wired
  // into GraphView as a real prop instead of sitting unused.
  const VIOLATIONS: Violation[] = [
    {
      ruleId: "R2",
      severity: "Critical",
      sourceNode:
        "services/payment-service/paymentService.js::syncConfigToRedis",
      sinkNode: "services/notification-service/notificationService.js",
      path: [
        "services/payment-service/paymentService.js::syncConfigToRedis",
        "services/notification-service/notificationService.js",
      ],
      taintTypes: ["pci"],
      suggestion:
        "Encrypt or mask PCI data before sending it across zone boundaries, or use an explicit, authorised API call.",
    },
    {
      ruleId: "R3",
      severity: "Critical",
      sourceNode:
        "services/payment-service/paymentService.js::syncConfigToRedis",
      sinkNode: "services/notification-service/notificationService.js",
      path: [
        "services/payment-service/paymentService.js::syncConfigToRedis",
        "services/notification-service/notificationService.js",
      ],
      taintTypes: ["secret"],
      suggestion:
        "Do not transmit secrets through implicit channels (e.g., Kafka, Redis pub/sub). Use a secrets manager with explicit, authorised access.",
    },
    {
      ruleId: "R2",
      severity: "Critical",
      sourceNode: "services/payment-service/paymentService.js::processPayment",
      sinkNode: "services/analytics-service/analyticsService.js",
      path: [
        "services/payment-service/paymentService.js::processPayment",
        "services/payment-service/paymentService.js::publishTransaction",
        "services/analytics-service/analyticsService.js",
      ],
      taintTypes: ["pci"],
      suggestion:
        "Encrypt or mask PCI data before sending it across zone boundaries, or use an explicit, authorised API call.",
    },
    {
      ruleId: "R1",
      severity: "High",
      sourceNode: "services/user-service/userService.js::getUserProfile",
      sinkNode: "services/user-service/userService.js::logActivity",
      path: [
        "services/user-service/userService.js::getUserProfile",
        "services/user-service/userService.js::logActivity",
      ],
      taintTypes: ["pii"],
      suggestion:
        "Add a PII sanitizer (e.g., maskPII, redact, hash) before the log sink. services/shared/logger.js already has isPiiField/maskValue — wire it before logActivity.",
    },
  ];

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.data?.elements) {
      setElements(result.data.elements);
    }
  };

  if (!projectId) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400">
        Add your Project ID in settings to load the graph.
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-full relative">
      {/* Refresh button — only shown when projectId is present */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="border border-[#B9B9B9]/50 bg-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={isFetching ? "animate-spin" : ""}
          >
            <path
              d="M9 0C4.1211 0 0 4.122 0 9C0 13.878 4.1211 18 9 18C13.8789 18 18 13.878 18 9C18 4.122 13.8789 0 9 0ZM9 16.2C5.0967 16.2 1.8 12.9024 1.8 9C1.8 5.4018 4.6035 2.3247 8.1 1.8657V3.681C5.5503 4.1121 3.6 6.3297 3.6 9C3.6 11.9781 6.0219 14.4 9 14.4C10.4355 14.4 11.79 13.8366 12.8133 12.8133L11.5407 11.5398C11.2084 11.8758 10.8127 12.1424 10.3766 12.3244C9.94045 12.5064 9.47256 12.6001 9 12.6C7.0146 12.6 5.4 10.9854 5.4 9C5.4 7.3278 6.5511 5.9301 8.1 5.5278V7.4592C7.569 7.7769 7.2 8.3529 7.2 9C7.2 9.9729 8.0271 10.8 9 10.8C9.9729 10.8 10.8 9.9729 10.8 9C10.8 8.3529 10.431 7.7769 9.9 7.4592V1.8657C13.3965 2.3247 16.2 5.4018 16.2 9C16.2 12.9024 12.9033 16.2 9 16.2Z"
              fill="#111111"
            />
          </svg>
          {isFetching ? "Loading..." : "Refresh Graph"}
        </button>
      </div>

      {isError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-red-50 text-red-500 text-sm px-4 py-2 rounded-lg border border-red-200">
          {error?.message ?? "Failed to load graph."}
        </div>
      )}

      {elements.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-gray-400">
          No graph data yet — click Refresh Graph to load.
        </div>
      ) : (
        <GraphView elements={elements} violations={VIOLATIONS} />
      )}
    </div>
  );
}
