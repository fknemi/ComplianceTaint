import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { ReportRequest, JsonReportResponse } from "@/types/report";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is not set. Add it to your .env file.");
}

async function fetchJsonReport(
  payload: ReportRequest,
): Promise<JsonReportResponse> {
  const response = await fetch(`${API_BASE_URL}/report/json`, {
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
      `JSON report generation failed (${response.status}): ${detail}`,
    );
  }

  return (await response.json()) as JsonReportResponse;
}

export function useGenerateJsonReport(
  options?: Omit<
    UseMutationOptions<JsonReportResponse, Error, ReportRequest>,
    "mutationFn"
  >,
) {
  return useMutation<JsonReportResponse, Error, ReportRequest>({
    mutationFn: fetchJsonReport,
    ...options,
  });
}

async function fetchPdfReport(payload: ReportRequest): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/report/pdf`, {
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
      `PDF report generation failed (${response.status}): ${detail}`,
    );
  }

  const blob = await response.blob();

  // Helper to extract filename from backend headers or fallback to default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = `compliance_report_${payload.projectId.slice(0, 8)}_${payload.commitId.slice(0, 8)}.pdf`;

  if (contentDisposition && contentDisposition.includes("filename=")) {
    filename = contentDisposition.split("filename=")[1].replace(/["']/g, "");
  }

  // Automatically trigger browser download
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);

  return blob;
}

export function useGeneratePdfReport(
  options?: Omit<UseMutationOptions<Blob, Error, ReportRequest>, "mutationFn">,
) {
  return useMutation<Blob, Error, ReportRequest>({
    mutationFn: fetchPdfReport,
    ...options,
  });
}
