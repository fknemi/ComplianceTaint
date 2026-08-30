export interface ViolationInput {
  ruleId: string;
  severity: string;
  sourceNode: string;
  sinkNode: string;
  path: string[];
  taintTypes: string[];
  suggestion: string;
}

export interface ReportRequest {
  projectId: string;
  commitId: string;
  branch?: string;
  violations: ViolationInput[];
}

export interface ReportMetadata {
  projectId: string;
  commitId: string;
  branch: string;
  generatedAt: string;
  totalViolations: number;
}

export interface JsonReportResponse {
  metadata: ReportMetadata;
  violations: ViolationInput[];
}
