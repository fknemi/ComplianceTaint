# engine/tagger.py
"""
Automatic tagging of graph nodes as sources, sinks, or sanitizers.

The tagging is based on simple heuristics derived from the function names,
node types, and possibly other metadata. For the MVP we rely on a predefined
list of function name patterns (hardcoded for the demo repository).
"""

from typing import Any, List
import re

class Tagger:
    """Assigns roles (source, sink, sanitizer) to graph nodes."""

    # Hardcoded patterns for the mock repo
    SOURCE_PATTERNS: List[str] = [
        r"getUserProfile",
        r"updateUserProfile",
        r"processPayment",
        r"getSecret",
        r"read.*(?:card|pan|pii)",
        r"accept.*input",
    ]
    SINK_PATTERNS: List[str] = [
        r"logActivity",
        r"logEvent",
        r"generateReport",
        r"sendNotification",
        r"publishTransaction",   # Kafka producer
        r"write.*file",
        r"http.*(?:call|request)",
    ]
    SANITIZER_PATTERNS: List[str] = [
        r"encrypt",
        r"hash",
        r"mask",
        r"redact",
        r"sanitize",
        r"validate",
    ]

    def __init__(self, graph: Any):
        self.graph = graph

    def _match_patterns(self, text: str, patterns: List[str]) -> bool:
        """Return True if text matches any regex pattern."""
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        return False

    def tag_all(self) -> None:
        """Tag all nodes with role = 'source', 'sink', 'sanitizer', or 'normal'."""
        for node in self.graph.nodes:
            attrs = self.graph.nodes[node]
            # Combine relevant string fields for pattern matching
            searchable = " ".join([
                attrs.get("function", ""),
                attrs.get("file", ""),
                attrs.get("type", ""),
                node,
            ])

            role = "normal"
            if self._match_patterns(searchable, self.SOURCE_PATTERNS):
                role = "source"
            elif self._match_patterns(searchable, self.SINK_PATTERNS):
                role = "sink"
            elif self._match_patterns(searchable, self.SANITIZER_PATTERNS):
                role = "sanitizer"

            attrs["role"] = role

            # If role is source, also assign a taint type based on heuristics
            if role == "source":
                taint_types = set()
                if re.search(r"(pan|card|payment|pci)", searchable, re.IGNORECASE):
                    taint_types.add("pci")
                if re.search(r"(user|email|phone|pii|gdpr)", searchable, re.IGNORECASE):
                    taint_types.add("pii")
                if re.search(r"(secret|token|key|credential)", searchable, re.IGNORECASE):
                    taint_types.add("secret")
                attrs["taint_types"] = list(taint_types)
            else:
                attrs["taint_types"] = []
