# engine/zones.py
"""
Compliance zone definitions and heuristic assignment.
"""

from enum import Enum
from typing import Any, Dict

class Zone(str, Enum):
    PCI = "pci"
    GDPR = "gdpr"
    RBI = "rbi"
    PUBLIC = "public"

# Map directory/filename patterns to zones.
# For the demo, we use simple heuristics based on service names or file paths.
ZONE_PATTERNS: Dict[str, Zone] = {
    "payment": Zone.PCI,
    "pci": Zone.PCI,
    "card": Zone.PCI,
    "user": Zone.GDPR,
    "gdpr": Zone.GDPR,
    "personal": Zone.GDPR,
    "rbi": Zone.RBI,
    "public": Zone.PUBLIC,
    "analytics": Zone.PUBLIC,
    "notification": Zone.PUBLIC,
}

def determine_zone_from_node(node_id: str, graph: Any) -> Zone:
    """
    Heuristically determine the compliance zone of a graph node based on its ID
    (which usually contains file path or service name). If no match, fall back
    to PUBLIC zone.
    """
    node_attrs = graph.nodes[node_id]
    # Try to use file path or service name if available
    file_path = node_attrs.get("file", node_id)
    if file_path:
        lower = file_path.lower()
        for pattern, zone in ZONE_PATTERNS.items():
            if pattern in lower:
                return zone
    # Fallback: check function name for hints
    func = node_attrs.get("function", "")
    lower = func.lower()
    for pattern, zone in ZONE_PATTERNS.items():
        if pattern in lower:
            return zone
    return Zone.PUBLIC

def assign_zones(graph: Any) -> None:
    """
    Assign `compliance_zone` attribute to every node in the graph.
    """
    for node in graph.nodes:
        zone = determine_zone_from_node(node, graph)
        graph.nodes[node]["compliance_zone"] = zone.value
