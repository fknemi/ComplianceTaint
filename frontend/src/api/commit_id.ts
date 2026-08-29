import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { CommitIdRequest, CommitIdResponse } from "@/types/commit_id";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is not set. Add it to your .env file.");
}

async function fetchCommitId(
  payload: CommitIdRequest,
): Promise<CommitIdResponse> {
  const response = await fetch(`${API_BASE_URL}/commit_id`, {
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
    throw new Error(`Commit ID request failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as CommitIdResponse;
}

export function useCommitId(
  options?: Omit
    UseMutationOptions<CommitIdResponse, Error, CommitIdRequest>,
    "mutationFn"
  >,
) {
  return useMutation<CommitIdResponse, Error, CommitIdRequest>({
    mutationFn: fetchCommitId,
    ...options,
  });
}
