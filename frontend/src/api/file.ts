import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { FileContentRequest, FileContentResponse } from "@/types/mcp";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is not set. Add it to your .env file.");
}

async function fetchFileContent(
  payload: FileContentRequest,
): Promise<FileContentResponse> {
  const response = await fetch(`${API_BASE_URL}/file`, {
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
    throw new Error(
      `File content request failed (${response.status}): ${detail}`,
    );
  }

  return (await response.json()) as FileContentResponse;
}

export function useFileContent(
  options?: Omit<
    UseMutationOptions<FileContentResponse, Error, FileContentRequest>,
    "mutationFn"
  >,
) {
  return useMutation<FileContentResponse, Error, FileContentRequest>({
    mutationFn: fetchFileContent,
    ...options,
  });
}
