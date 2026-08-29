export interface CommitIdRequest {
  projectId: string;
  apiKey?: string;
  branch?: string;
}

export interface CommitIdResponse {
  commitId: string;
}
