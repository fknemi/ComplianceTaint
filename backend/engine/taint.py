# engine/taint.py
"""
Taint propagation engine using BFS over the dependency graph.

The engine propagates taint tags (pii, pci, secret) from source nodes
through the graph, respecting sanitizers and detecting violations:
- Rule 1: PII data reaches a log sink without sanitization.
- Rule 2: PCI data crosses zone boundary into non-PCI zone.
- Rule 3: Secret data flows through implicit edge to unauthorized node.

The output is a list of Violation objects containing path details.
"""

from typing import Any, Dict, List, Set, Tuple, Optional
from dataclasses import dataclass, field
from collections import deque

@dataclass
class Violation:
    rule_id: str
    description: str
    severity: str
    source_node: str
    sink_node: str = None
    path: List[str] = field(default_factory=list)  # list of node IDs
    taint_types: Set[str] = field(default_factory=set)
    crossing_zone: Tuple[str, str] = None  # (from_zone, to_zone)
    suggestion: str = None

class TaintEngine:
    """
    Performs BFS taint propagation and violation detection.
    """

    def __init__(self, graph: Any):
        self.graph = graph
        self.violations: List[Violation] = []

    def _is_sanitizer(self, node: str) -> bool:
        return self.graph.nodes[node].get("role") == "sanitizer"

    def _is_sink(self, node: str) -> bool:
        return self.graph.nodes[node].get("role") == "sink"

    def _zone_of(self, node: str) -> str:
        return self.graph.nodes[node].get("compliance_zone", "public")

    def _edge_type(self, src: str, dst: str) -> str:
        # Assume simple graph (no multi-edges). If MultiDiGraph, take first edge.
        try:
            data = self.graph.get_edge_data(src, dst)
            if data is None:
                return "primary"
            # If multiple edges, take the first one's type
            if isinstance(data, dict) and "edge_type" in data:
                return data["edge_type"]
            # If MultiDiGraph, data may be a dict of key->edge_attrs
            if isinstance(data, dict) and all(isinstance(v, dict) for v in data.values()):
                # MultiDiGraph: pick first edge
                first_edge = next(iter(data.values()))
                return first_edge.get("edge_type", "primary")
            return "primary"
        except:
            return "primary"

    def _is_implicit_edge(self, src: str, dst: str) -> bool:
        return self._edge_type(src, dst) == "implicit"

    def run(self) -> List[Violation]:
        """
        Execute taint propagation and collect violations.
        Returns list of Violation objects.
        """
        self.violations = []

        # Initialize BFS queue with all source nodes that have taint types.
        queue = deque()
        visited = set()  # (node, frozenset(taint_tags)) to avoid reprocessing

        for node in self.graph.nodes:
            attrs = self.graph.nodes[node]
            if attrs.get("role") == "source" and attrs.get("taint_types"):
                taint_tags = set(attrs["taint_types"])
                path = [node]
                queue.append((node, path, taint_tags, False))
                visited.add((node, frozenset(taint_tags)))

        while queue:
            current, path, taint_tags, sanitized = queue.popleft()

            # If taint_tags is empty, nothing to propagate
            if not taint_tags:
                continue

            # Check if current node is a sink and we still have taint (unsanitized)
            if self._is_sink(current) and not sanitized:
                # Determine rule based on taint types
                if "pii" in taint_tags:
                    self._add_violation(
                        rule_id="R1",
                        description="PII data reaches a log sink without sanitization.",
                        severity="High",
                        source_node=path[0],
                        sink_node=current,
                        path=path.copy(),
                        taint_types=taint_tags.copy(),
                        suggestion="Add a sanitizer (e.g., mask_email, redact_pan) before the sink."
                    )

            for neighbor in self.graph.successors(current):
                target_zone = self._zone_of(neighbor)
                current_zone = self._zone_of(current)

                # If taint still active (not sanitized) and zones differ, that's a zone violation.
                if not sanitized and target_zone != current_zone:
                    if "pci" in taint_tags and target_zone != "pci":
                        # Rule 2: PCI data crossing into non-PCI zone
                        self._add_violation(
                            rule_id="R2",
                            description="PCI data crosses into a non-PCI zone.",
                            severity="Critical",
                            source_node=path[0],
                            sink_node=neighbor,
                            path=path + [neighbor],
                            taint_types={"pci"},
                            crossing_zone=(current_zone, target_zone),
                            suggestion="Encrypt or mask PCI data before sending across zones."
                        )
                    if "secret" in taint_tags:
                        # Rule 3: Secret flowing into non-authorized zone
                        self._add_violation(
                            rule_id="R3",
                            description="Secret data crosses zone boundary without authorization.",
                            severity="Critical",
                            source_node=path[0],
                            sink_node=neighbor,
                            path=path + [neighbor],
                            taint_types={"secret"},
                            crossing_zone=(current_zone, target_zone),
                            suggestion="Ensure secrets are not transmitted across services or zones."
                        )

                # Determine new taint tags after possible sanitization
                new_taint_tags = taint_tags.copy()
                new_sanitized = sanitized

                # If neighbor is a sanitizer and not already sanitized, we neutralize taint.
                if self._is_sanitizer(neighbor) and not sanitized:
                    new_taint_tags.clear()
                    new_sanitized = True
                    # We do not enqueue the sanitized path further,
                    # but we still record the sanitizer node as visited (with empty tags)
                    # to avoid reprocessing.
                    visited.add((neighbor, frozenset(new_taint_tags)))
                    continue  # skip enqueueing sanitized neighbor

                # Add to visited and enqueue if not already visited with same tags
                state = (neighbor, frozenset(new_taint_tags))
                if state not in visited:
                    visited.add(state)
                    new_path = path + [neighbor]
                    queue.append((neighbor, new_path, new_taint_tags, new_sanitized))

        return self.violations

    def _add_violation(self, rule_id, description, severity, source_node,
                       sink_node, path, taint_types, crossing_zone=None,
                       suggestion=None):
        violation = Violation(
            rule_id=rule_id,
            description=description,
            severity=severity,
            source_node=source_node,
            sink_node=sink_node,
            path=path,
            taint_types=taint_types,
            crossing_zone=crossing_zone,
            suggestion=suggestion,
        )
        self.violations.append(violation)
