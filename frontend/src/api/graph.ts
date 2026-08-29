import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { GraphParams, GraphResponse } from "@/types/graph";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is not set. Add it to your .env file.");
}

async function fetchGraph(params: GraphParams): Promise<GraphResponse> {
  const queryParams = new URLSearchParams({
    projectId: params.projectId,
    ...(params.branch ? { branch: params.branch } : {}),
    ...(params.commitId ? { commitId: params.commitId } : {}),
    apiKey: params.apiKey,
  });

  const response = await fetch(`${API_BASE_URL}/graph?${queryParams}`);

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errorBody = await response.json();
      detail = errorBody?.detail ?? detail;
    } catch {}
    throw new Error(`Graph request failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as GraphResponse;
}

export function useGraph(
  params: GraphParams,
  options?: Omit<UseQueryOptions<GraphResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<GraphResponse, Error>({
    queryKey: ["graph", params.projectId, params.branch, params.commitId],
    queryFn: () => fetchGraph(params),
    ...options,
  });
}
