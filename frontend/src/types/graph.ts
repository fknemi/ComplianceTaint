export interface GraphResponse {
  elements: Array<Record<string, unknown>>;
}

export interface GraphParams {
  projectId: string;
  branch?: string;
  commitId?: string;
  apiKey: string;
}
