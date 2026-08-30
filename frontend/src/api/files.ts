import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { ListFilesRequest, ListFilesResponse } from "@/types/mcp";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is not set. Add it to your .env file.");
}

async function fetchFiles(
  payload: ListFilesRequest,
): Promise<ListFilesResponse> {
  const response = await fetch(`${API_BASE_URL}/files`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch: "main",
      ...payload,
    }),
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errorBody = await response.json();
      detail = errorBody?.detail ?? detail;
    } catch {}
    throw new Error(`List files request failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as ListFilesResponse;
}

export function useListFiles(
  options?: Omit<
    UseMutationOptions<ListFilesResponse, Error, ListFilesRequest>,
    "mutationFn"
  >,
) {
  return useMutation<ListFilesResponse, Error, ListFilesRequest>({
    mutationFn: fetchFiles,
    ...options,
  });
}
