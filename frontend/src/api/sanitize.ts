import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { SanitizeResponse, SanitizeVariables } from "@/types/sanitizer";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is not set. Add it to your .env file.");
}

async function applySanitizer(
  variables: SanitizeVariables,
): Promise<SanitizeResponse> {
  const queryParams = new URLSearchParams({
    nodeId: variables.nodeId,
    projectId: variables.projectId,
    ...(variables.branch ? { branch: variables.branch } : {}),
    ...(variables.commitId ? { commitId: variables.commitId } : {}),
    apiKey: variables.apiKey,
  });

  const response = await fetch(`${API_BASE_URL}/sanitize?${queryParams}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    // Only include body if sanitizerType is provided
    body: variables.sanitizerType
      ? JSON.stringify({ sanitizerType: variables.sanitizerType })
      : undefined,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errorBody = await response.json();
      detail = errorBody?.detail ?? detail;
    } catch {}
    throw new Error(`Sanitizer request failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as SanitizeResponse;
}

export function useSanitize(
  options?: Omit<
    UseMutationOptions<SanitizeResponse, Error, SanitizeVariables>,
    "mutationFn"
  >,
) {
  return useMutation<SanitizeResponse, Error, SanitizeVariables>({
    mutationFn: applySanitizer,
    ...options,
  });
}
