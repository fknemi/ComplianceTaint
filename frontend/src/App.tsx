import { useState } from "react";
import { useRunAudit } from "@/api/audit";
import { useGraph } from "@/api/graph";
import { useSanitize } from "@/api/sanitize";

// Hardcoded values for demonstration – replace with real inputs or environment variables
const PROJECT_ID = "ff65c5aa-4f75-4fcc-a9b0-8b9ea463f86a";
const BRANCH = "main";
const COMMIT_ID = "be51b76e7eddf08af2a3b53d935df04bc2195f92";
const NODE_ID = "services/payment-service/paymentService.js::syncConfigToRedis";
const SANITIZER_TYPE = "htmlEncode";

function App() {
  // Audit mutation
  const {
    mutate: runAudit,
    data: auditData,
    error: auditError,
    isPending: auditPending,
  } = useRunAudit();

  // Graph query – we'll trigger manually with a button, so use refetch
  const {
    data: graphData,
    error: graphError,
    isFetching: graphFetching,
    refetch: fetchGraph,
  } = useGraph(
    {
      projectId: PROJECT_ID,
      branch: BRANCH,
      commitId: COMMIT_ID,
    },
    {
      enabled: false, // don't run automatically on mount
    },
  );

  // Sanitize mutation
  const {
    mutate: applySanitizer,
    data: sanitizeData,
    error: sanitizeError,
    isPending: sanitizePending,
  } = useSanitize();

  const handleRunAudit = () => {
    runAudit(
      {
        projectId: PROJECT_ID,
        branch: BRANCH,
        commitId: COMMIT_ID,
      },
      {
        onSuccess: (result) => {
          console.log("Audit succeeded:", result);
        },
        onError: (err) => {
          console.error("Audit failed:", err);
        },
      },
    );
  };

  const handleFetchGraph = () => {
    fetchGraph(); // triggers the query again
    console.log("Fetching graph...");
  };

  const handleSanitize = () => {
    applySanitizer(
      {
        nodeId: NODE_ID,
        projectId: PROJECT_ID,
        branch: BRANCH,
        commitId: COMMIT_ID,
        sanitizerType: SANITIZER_TYPE,
      },
      {
        onSuccess: (result) => {
          console.log("Sanitizer response:", result);
        },
        onError: (err) => {
          console.error("Sanitizer failed:", err);
        },
      },
    );
  };

  return (
    <div className="p-4 space-y-8">
      <h1 className="text-xl font-bold">API Hooks Demo</h1>

      {/* Audit Section */}
      <section>
        <h2 className="text-lg font-semibold">Run Audit</h2>
        <button
          onClick={handleRunAudit}
          disabled={auditPending}
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {auditPending ? "Running..." : "Run Audit"}
        </button>
        {auditError && (
          <p className="text-red-500 mt-2">Error: {auditError.message}</p>
        )}
        {auditData && (
          <pre className="mt-2 bg-gray-100 p-2 text-sm overflow-auto">
            {JSON.stringify(auditData, null, 2)}
          </pre>
        )}
      </section>

      {/* Graph Section */}
      <section>
        <h2 className="text-lg font-semibold">Fetch Graph</h2>
        <button
          onClick={handleFetchGraph}
          disabled={graphFetching}
          className="mt-2 px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
        >
          {graphFetching ? "Fetching..." : "Fetch Graph"}
        </button>
        {graphError && (
          <p className="text-red-500 mt-2">Error: {graphError.message}</p>
        )}
        {graphData && (
          <pre className="mt-2 bg-gray-100 p-2 text-sm overflow-auto">
            {JSON.stringify(graphData, null, 2)}
          </pre>
        )}
      </section>

      {/* Sanitizer Section */}
      <section>
        <h2 className="text-lg font-semibold">Apply Sanitizer</h2>
        <button
          onClick={handleSanitize}
          disabled={sanitizePending}
          className="mt-2 px-4 py-2 bg-purple-500 text-white rounded disabled:opacity-50"
        >
          {sanitizePending ? "Applying..." : "Apply Sanitizer"}
        </button>
        {sanitizeError && (
          <p className="text-red-500 mt-2">Error: {sanitizeError.message}</p>
        )}
        {sanitizeData && (
          <pre className="mt-2 bg-gray-100 p-2 text-sm overflow-auto">
            {JSON.stringify(sanitizeData, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

export default App;
