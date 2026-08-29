"""
Compliance Zone Mapping and Heuristic Assignment Engine.

This module governs the classification of graph nodes into distinct compliance
zones. These classifications provide the architectural context for the taint 
propagation engine, specifically driving boundary-crossing evaluations:

- Rule 2 (Cross-Zone Leakage): Regulates the flow of PCI data across boundaries.
- Rule 3 (Secret Exposure): Prevents secrets from entering unprivileged zones.

Design Principles:
- Shared Infrastructure: The SHARED zone designates neutral, trusted infrastructure
  (e.g., Redis clusters, Kafka brokers) authorised for secure transit. Violations
  trigger only when data exits SHARED into an unprivileged zone without sanitization.
- Implicit Contexts: Subsystems handling implicit financial or identity data are
  automatically escalated to stricter zones (e.g., audit trails align with PCI; 
  authentication services align with GDPR).
"""

from enum import Enum
from typing import Any, Dict


class Zone(str, Enum):
    PCI    = "pci"
    GDPR   = "gdpr"
    RBI    = "rbi"
    PUBLIC = "public"
    SHARED = "shared"


# ---------------------------------------------------------------------------
# Zone-to-pattern map.
# Rules:
#   - Checked against file path, function name, and raw node id (in that order).
#   - First matching pattern wins — put more-specific strings FIRST.
#   - All patterns are matched as substrings (case-insensitive).
# ---------------------------------------------------------------------------
ZONE_PATTERNS: Dict[str, Zone] = {
    # ── PCI-scope ────────────────────────────────────────────────────────
    "payment":   Zone.PCI,
    "pci":       Zone.PCI,
    "card":      Zone.PCI,
    # Audit service records financial transactions — treat as PCI scope.
    # Must come before any broader pattern that could match "audit" as public.
    "audit":     Zone.PCI,

    # ── GDPR-scope ───────────────────────────────────────────────────────
    "user":      Zone.GDPR,
    "gdpr":      Zone.GDPR,
    "personal":  Zone.GDPR,
    # Auth service manages user sessions and credentials — GDPR scope.
    "auth":      Zone.GDPR,

    # ── RBI-scope ────────────────────────────────────────────────────────
    "rbi":       Zone.RBI,

    # ── Shared / neutral infrastructure ──────────────────────────────────
    # Matches services/shared/* — must come before "public" / "analytics"
    # so that shared utilities aren't downgraded to PUBLIC.
    "shared":    Zone.SHARED,

    # ── Public / analytics (broadest — checked last) ──────────────────────
    "public":       Zone.PUBLIC,
    "analytics":    Zone.PUBLIC,
    "notification": Zone.PUBLIC,
}


def determine_zone_from_node(node_id: str, graph: Any) -> Zone:
    """
    Heuristically determine the compliance zone of a graph node.

    Resolution order:
      1. ``file`` attribute of the node (usually a service or module path).
      2. ``function`` attribute of the node.
      3. The raw node id.
      4. Fall back to PUBLIC if nothing matches.
    """
    attrs = graph.nodes[node_id]

    candidates = [
        attrs.get("file", ""),
        attrs.get("function", ""),
        node_id,
    ]

    for candidate in candidates:
        if not candidate:
            continue
        lower = candidate.lower()
        for pattern, zone in ZONE_PATTERNS.items():
            if pattern in lower:
                return zone

    return Zone.PUBLIC


def assign_zones(graph: Any) -> None:
    """
    Assign the ``compliance_zone`` string attribute to every node in *graph*.
    Must be called before :class:`~engine.taint.TaintEngine` is run.
    """
    for node in graph.nodes:
        zone = determine_zone_from_node(node, graph)
        graph.nodes[node]["compliance_zone"] = zone.value
