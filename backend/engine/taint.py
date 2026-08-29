"""
Taint propagation engine using BFS over the dependency graph.

Rules:
- R1: PII data reaches a LOG sink without sanitization.
- R2: PCI data crosses zone boundary into a non-PCI, non-SHARED zone
      via a path that includes at least one implicit edge.
      (shared zone is trusted infrastructure — no violation there)
- R3: Secret data flows via an implicit edge into an unauthorised zone
      (anything outside pci or shared).
"""

from typing import Any, Dict, FrozenSet, List, Set, Tuple, Optional
from dataclasses import dataclass, field
from collections import deque
import re

# ---------------------------------------------------------------------------
# Sanitizer capability registry
# ---------------------------------------------------------------------------
SANITIZER_CAPABILITIES: Dict[re.Pattern, Set[str]] = {
    re.compile(r"mask_email|redact_email|anonymise_email", re.IGNORECASE): {"pii"},
    re.compile(r"mask_pan|redact_pan|mask_card", re.IGNORECASE): {"pci"},
    re.compile(r"encrypt", re.IGNORECASE): {"pci", "secret"},
    re.compile(r"hash", re.IGNORECASE): {"pii", "pci"},
    re.compile(r"redact(?!_email|_pan)", re.IGNORECASE): {"pii", "pci", "secret"},
    re.compile(r"sanitize|validate", re.IGNORECASE): {"pii"},
    re.compile(r"maskPII|mask_pii|maskValue|mask_value", re.IGNORECASE): {"pii"},
    re.compile(r"maskPattern|mask_pattern", re.IGNORECASE): {"pii", "pci"},
}


def _sanitizer_clears(node_id: str, function_name: str) -> Set[str]:
    searchable = (node_id + " " + function_name).strip()
    cleared: Set[str] = set()
    for pattern, caps in SANITIZER_CAPABILITIES.items():
        if pattern.search(searchable):
            cleared |= caps
    return cleared


# ---------------------------------------------------------------------------
# Zone authority definitions
# ---------------------------------------------------------------------------
# Zones where PCI data is allowed to flow without triggering R2.
_PCI_ALLOWED_ZONES: Set[str] = {"pci", "shared"}

# Zones where secrets are allowed to exist without triggering R3.
_AUTHORISED_SECRET_ZONES: Set[str] = {"pci", "shared"}


@dataclass
class Violation:
    rule_id: str
    description: str
    severity: str
    source_node: str
    sink_node: str = None
    path: List[str] = field(default_factory=list)
    taint_types: Set[str] = field(default_factory=set)
    crossing_zone: Tuple[str, str] = None
    suggestion: str = None


class TaintEngine:
    def __init__(self, graph: Any):
        self.graph = graph
        self.violations: List[Violation] = []
        self._reported: Set[tuple] = set()

    # ------------------------------------------------------------------
    # Graph helpers
    # ------------------------------------------------------------------

    def _role(self, node: str) -> str:
        return self.graph.nodes[node].get("role", "normal")

    def _is_sanitizer(self, node: str) -> bool:
        return self._role(node) == "sanitizer"

    def _is_sink(self, node: str) -> bool:
        return self._role(node) in ("sink", "log_sink")

    def _is_log_sink(self, node: str) -> bool:
        return self._role(node) == "log_sink"

    def _zone_of(self, node: str) -> str:
        return self.graph.nodes[node].get("compliance_zone", "public")

    def _edge_type(self, src: str, dst: str) -> str:
        try:
            data = self.graph.get_edge_data(src, dst)
            if data is None:
                return "primary"
            if isinstance(data, dict) and "edge_type" in data:
                return data["edge_type"]
            if isinstance(data, dict) and all(isinstance(v, dict) for v in data.values()):
                first_edge = next(iter(data.values()))
                return first_edge.get("edge_type", "primary")
            return "primary"
        except Exception:
            return "primary"

    def _is_implicit_edge(self, src: str, dst: str) -> bool:
        return self._edge_type(src, dst) == "implicit"

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def run(self) -> List[Violation]:
        self.violations = []
        self._reported = set()

        queue: deque = deque()
        visited: Set[Tuple] = set()

        for node in self.graph.nodes:
            attrs = self.graph.nodes[node]
            if attrs.get("role") == "source" and attrs.get("taint_types"):
                taint_tags: FrozenSet[str] = frozenset(attrs["taint_types"])
                initial_state = (node, frozenset(taint_tags), False)
                if initial_state not in visited:
                    visited.add(initial_state)
                    queue.append(
                        (node, [node], set(taint_tags), set(taint_tags), False)
                    )

        while queue:
            current, path, taint_tags, _, seen_implicit = queue.popleft()

            if not taint_tags:
                continue

            # ---- Rule 1: PII reaching a LOG sink ----------------------------
            if self._is_log_sink(current) and "pii" in taint_tags:
                self._add_violation(
                    rule_id="R1",
                    description="PII data reaches a logging sink without PII sanitization.",
                    severity="High",
                    source_node=path[0],
                    sink_node=current,
                    path=list(path),
                    taint_types={"pii"},
                    suggestion=(
                        "Add a PII sanitizer (e.g., maskPII, redact, hash) before "
                        "the log sink. services/shared/logger.js already has "
                        "isPiiField/maskValue — wire it before logActivity."
                    ),
                )

            # ---- Propagate to neighbours ------------------------------------
            for neighbor in self.graph.successors(current):
                # Skip file→function primary edges to prevent sibling function taint contamination
                neighbor_attrs = self.graph.nodes[neighbor]
                edge_type = self._edge_type(current, neighbor)
                neighbor_type = neighbor_attrs.get("type", "")
                current_type = self.graph.nodes[current].get("type", "")

                if (
                    edge_type == "primary"
                    and current_type == "file"
                    and neighbor_type == "function"
                ):
                    continue  # file→function edges are structural only, not data flow

                target_zone = self._zone_of(neighbor)
                current_zone = self._zone_of(current)

                edge_implicit = self._is_implicit_edge(current, neighbor)
                new_seen_implicit = seen_implicit or edge_implicit
                zone_crossed = target_zone != current_zone

                if not taint_tags:
                    continue

                if zone_crossed and new_seen_implicit:
                    # Rule 2: PCI leaving PCI zone AND not landing in an
                    # authorised zone (shared is trusted infrastructure).
                    if "pci" in taint_tags and target_zone not in _PCI_ALLOWED_ZONES:
                        self._add_violation(
                            rule_id="R2",
                            description=(
                                "PCI data crosses into an untrusted zone via a path "
                                "that includes at least one implicit edge."
                            ),
                            severity="Critical",
                            source_node=path[0],
                            sink_node=neighbor,
                            path=path + [neighbor],
                            taint_types={"pci"},
                            crossing_zone=(current_zone, target_zone),
                            suggestion=(
                                "Encrypt or mask PCI data before sending it across "
                                "zone boundaries, or use an explicit, authorised API call."
                            ),
                        )

                    # Rule 3: Secret crossing into an unauthorised zone
                    # via an implicit edge.
                    if "secret" in taint_tags and target_zone not in _AUTHORISED_SECRET_ZONES:
                        self._add_violation(
                            rule_id="R3",
                            description=(
                                "Secret data crosses a zone boundary via an implicit "
                                "channel into an unauthorised zone."
                            ),
                            severity="Critical",
                            source_node=path[0],
                            sink_node=neighbor,
                            path=path + [neighbor],
                            taint_types={"secret"},
                            crossing_zone=(current_zone, target_zone),
                            suggestion=(
                                "Do not transmit secrets through implicit channels "
                                "(e.g., Kafka, Redis pub/sub). Use a secrets manager "
                                "with explicit, authorised access."
                            ),
                        )

                # ---- Sanitizer handling -------------------------------------
                new_taint_tags = set(taint_tags)
                if self._is_sanitizer(neighbor):
                    attrs = self.graph.nodes[neighbor]
                    func_name = attrs.get("function", "")
                    cleared = _sanitizer_clears(neighbor, func_name)
                    new_taint_tags -= cleared
                    if not new_taint_tags:
                        continue

                state = (neighbor, frozenset(new_taint_tags), new_seen_implicit)
                if state not in visited:
                    visited.add(state)
                    queue.append(
                        (neighbor, path + [neighbor], new_taint_tags,
                         new_taint_tags, new_seen_implicit)
                    )

        return self.violations

    # ------------------------------------------------------------------
    # Violation helpers
    # ------------------------------------------------------------------

    def _add_violation(
        self,
        rule_id: str,
        description: str,
        severity: str,
        source_node: str,
        sink_node: str,
        path: List[str],
        taint_types: Set[str],
        crossing_zone: Tuple[str, str] = None,
        suggestion: str = None,
    ) -> None:
        dedup_key = (rule_id, source_node, sink_node, tuple(path))
        if dedup_key in self._reported:
            return
        self._reported.add(dedup_key)
        self.violations.append(
            Violation(
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
        )
