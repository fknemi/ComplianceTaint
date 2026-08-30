export interface ListFilesRequest {
  projectId: string;
  branch?: string;
  apiKey?: string | null;
}

// The API returns whatever the upstream server sends, usually an array or dict
export type ListFilesResponse = any; 

export interface FileContentRequest {
  projectId: string;
  path: string;
  branch?: string;
  apiKey?: string | null;
}

// The API returns the file data/content
export type FileContentResponse = any;
