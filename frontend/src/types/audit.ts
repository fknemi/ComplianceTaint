export interface AuditRequest {
  projectId: string;
  apiKey?: string;
  branch?: string;
  commitId: string | null;
}

export interface ViolationResponse {
  ruleId: string;
  severity: string;
  sourceNode: string;
  sinkNode: string;
  path: string[];
  taintTypes: string[];
  crossingZone: [string, string] | null;
  suggestion: string;
}

export interface AuditResponse {
  violations: ViolationResponse[];
}
