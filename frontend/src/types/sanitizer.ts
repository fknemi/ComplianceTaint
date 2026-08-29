export interface SanitizeResponse {
  status: string;
  node: string;
  role: string;
  recommendedSanitizer?: string;
  message?: string;
}

export interface SanitizeVariables {
  nodeId: string;
  projectId: string;
  branch?: string;
  commitId?: string;
  sanitizerType?: string;
  apiKey: string;
}
