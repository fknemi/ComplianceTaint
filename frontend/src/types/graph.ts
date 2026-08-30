export interface GraphResponse {
  elements: Array<Record<string, unknown>>;
}

export interface GraphParams {
  projectId: string;
  branch?: string;
  commitId?: string;
  apiKey: string;
}






export interface GraphNode {
  type: "function" | "file";
  id: string;
  file: string;
  function: string;
  role: "normal" | "source" | "sink" | "sanitizer" | "log_sink";
  taint_types: string[];
  compliance_zone: "public" | "shared" | "pci" | "gdpr";
}

export interface GraphEdge {
  type: "edge";
  source: string;
  target: string;
  edge_type: "primary" | "implicit";
  data_flow_type: "sync" | "call" | "qualified_call" | "implicit" | "kafka" | "redis";
  line?: number;
  confidence?: { source: string; parsedValue: number };
  resolution?: "same_file" | "type_hint" | "imported_symbol";
  is_external?: boolean;
  is_unresolved?: boolean;
  callee_raw?: string;
}

export type GraphElement = GraphNode | GraphEdge;

export interface GraphElementsResponse {
  elements: GraphElement[];
}





// Add to your existing @/types/graph.ts (or a new @/types/violation.ts —
// adjust the import path in GraphView.tsx / GraphPage.tsx to match wherever you put this).

export type Severity = "Critical" | "High" | "Medium" | "Low";

export interface Violation {
  ruleId: string;
  severity: Severity;
  sourceNode: string;
  sinkNode: string;
  path: string[]; // ordered node ids, sourceNode -> ... -> sinkNode
  taintTypes: string[];
  suggestion: string;
}
