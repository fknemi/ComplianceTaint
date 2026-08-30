import type { GraphElement, GraphNode, GraphEdge } from "@/types/graph";

export function toCytoscapeElements(elements: GraphElement[]) {
  return elements.map((el) => {
    if (el.type === "edge") {
      const edge = el as GraphEdge;
      return {
        data: {
          id: `${edge.source}-${edge.target}-${edge.data_flow_type}`,
          source: edge.source,
          target: edge.target,
          edge_type: edge.edge_type,
          data_flow_type: edge.data_flow_type,
          confidence: edge.confidence?.parsedValue ?? 1,
          is_external: edge.is_external,
          is_unresolved: edge.is_unresolved,
        },
      };
    } else {
      const node = el as GraphNode;
      return {
        data: {
          id: node.id,
          label: node.function ?? node.file,
          file: node.file,
          function: node.function,
          role: node.role,
          taint_types: node.taint_types,
          compliance_zone: node.compliance_zone,
          type: node.type,
        },
      };
    }
  });
}
