import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { AuditRequest, AuditResponse } from "@/types/audit";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is not set. Add it to your .env file.");
}

async function runAudit(payload: AuditRequest): Promise<AuditResponse> {
  const response = await fetch(`${API_BASE_URL}/audit`, {
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
    throw new Error(`Audit request failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as AuditResponse;
}

export function useRunAudit(
  options?: Omit<
    UseMutationOptions<AuditResponse, Error, AuditRequest>,
    "mutationFn"
  >,
) {
  return useMutation<AuditResponse, Error, AuditRequest>({
    mutationFn: runAudit,
    ...options,
  });
}
