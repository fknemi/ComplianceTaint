"""
engine/tagger.py
Automatic tagging of graph nodes as sources, sinks, sanitizers, or log-sinks.

Two sink sub-types are distinguished:
  sink        – general output sink (Kafka, HTTP, file writes, reports, …)
  log_sink    – sink that specifically writes to a log or audit trail

"""

import re
from typing import Any, List


class Tagger:
    """Assigns roles (source, sink, log_sink, sanitizer) to graph nodes."""

    # ------------------------------------------------------------------ #
    # Source patterns – functions that introduce tainted data              #
    # ------------------------------------------------------------------ #
    SOURCE_PATTERNS: List[str] = [
        # PII
        r"getUserProfile",
        r"updateUserProfile",
        r"getUser(?!s)",
        r"fetchUser",
        r"readUser",
        # PCI
        r"processPayment",
        r"chargeCard",
        r"readCard",
        r"fetchCard",
        # Generic
        r"read.*(?:card|pan|pii)",
        r"accept.*input",
        r"syncConfigToRedis",
    ]
    # ------------------------------------------------------------------ #
    # Log-sink patterns — matched against FUNCTION NAME ONLY               #
    # ------------------------------------------------------------------ #
    LOG_SINK_PATTERNS: List[str] = [
        r"^logActivity$",
        r"^logEvent$",
        r"^log_activity$",
        r"^log_event$",
        r"^logAuditEvent$",
        r"^writeLog$",
        r"^write_log$",
        r"^auditLog$",
        r"^audit_log$",
        r"^writeToDatabase$",
        r"^writeToFile$",
        r"^createAuditRecord$",
        r"^log(?:Debug|Info|Warn|Error|Critical|Audit)$",
    ]

    # ------------------------------------------------------------------ #
    # File-level log-sink patterns — matched against file path only        #
    # Used for bare file nodes (no meaningful function name).              #
    # ------------------------------------------------------------------ #
    LOG_SINK_FILE_PATTERNS: List[str] = [
        r"auditLogger\.js$",
        r"audit_logger\.py$",
    ]

    # ------------------------------------------------------------------ #
    # General sink patterns (non-log)                                      #
    # ------------------------------------------------------------------ #
    SINK_PATTERNS: List[str] = [
        r"generateReport",
        r"sendNotification",
        r"publishTransaction",
        r"write.*file",
        r"http.*(?:call|request)",
        r"send.*(?:email|sms|push)",
        r"export",
    ]

    # ------------------------------------------------------------------ #
    # Sanitizer patterns                                                   #
    # ------------------------------------------------------------------ #
    SANITIZER_PATTERNS: List[str] = [
        r"encrypt",
        r"hash",
        r"mask",
        r"redact",
        r"sanitize",
        r"validate",
        r"anonymise",
        r"anonymize",
    ]

    # ------------------------------------------------------------------ #
    # Secret-source file patterns — if a file node matches these, it is   #
    # tagged as a secret source even without a matching function name.     #
    # ------------------------------------------------------------------ #
    SECRET_SOURCE_FILE_PATTERNS: List[str] = [
        r"secret",
        r"credential",
        r"vault",
        r"keystore",
        r"keyManager",
    ]
    _SECRET_SOURCE_FUNCTIONS = {
        "syncConfigToRedis",  # broadcasts STRIPE_SECRET_KEY to Redis
    }

    def __init__(self, graph: Any) -> None:
        self.graph = graph

    # ------------------------------------------------------------------ #
    # Internal helpers                                                     #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _match_patterns(text: str, patterns: List[str]) -> bool:
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        return False

    def _searchable(self, node: str) -> str:
        """Full text for source/sink/sanitizer matching."""
        attrs = self.graph.nodes[node]
        return " ".join(
            [
                attrs.get("function", ""),
                attrs.get("file", ""),
                attrs.get("type", ""),
                node,
            ]
        )

    def _function_name(self, node: str) -> str:
        return self.graph.nodes[node].get("function", "")

    def _file_path(self, node: str) -> str:
        return self.graph.nodes[node].get("file", "")

    def _is_log_sink(self, node: str) -> bool:
        """Match log_sink on function name only, then file path for file nodes."""
        func = self._function_name(node)
        if func and self._match_patterns(func, self.LOG_SINK_PATTERNS):
            return True
        file_path = self._file_path(node)
        if file_path and self._match_patterns(file_path, self.LOG_SINK_FILE_PATTERNS):
            return True
        return False

    def _taint_types_for_source(self, node: str, text: str) -> List[str]:
        taint_types: set = set()
        func = self._function_name(node)
        if re.search(r"(pan|card|payment|pci)", text, re.IGNORECASE):
            taint_types.add("pci")
        if re.search(r"(user|email|phone|pii|gdpr|personal)", text, re.IGNORECASE):
            taint_types.add("pii")
        if re.search(
            r"(secret|token|key|credential|apikey|api.key|vault)", text, re.IGNORECASE
        ):
            taint_types.add("secret")
        if func in self._SECRET_SOURCE_FUNCTIONS:
            taint_types.add("secret")
        return list(taint_types)

    def _is_secret_source(self, node: str) -> bool:
        """Secret source patterns matched against function name only."""
        SECRET_FN_PATTERNS = [
            r"get.*secret",
            r"read.*secret",
            r"fetch.*secret",
            r"retrieve.*secret",
            r"get.*token",
            r"read.*token",
            r"get.*credential",
            r"get.*api.*key",
            r"getApiKey",
            r"loadSecret",
            r"load.*credential",
        ]
        func = self._function_name(node)
        return bool(func and self._match_patterns(func, SECRET_FN_PATTERNS))

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def tag_all(self) -> None:
        for node in self.graph.nodes:
            attrs = self.graph.nodes[node]
            text = self._searchable(node)

            if self._match_patterns(
                text, self.SOURCE_PATTERNS
            ) or self._is_secret_source(node):
                role = "source"
            elif self._is_log_sink(node):
                role = "log_sink"
            elif self._match_patterns(text, self.SINK_PATTERNS):
                role = "sink"
            elif self._match_patterns(text, self.SANITIZER_PATTERNS):
                role = "sanitizer"
            else:
                role = "normal"

            attrs["role"] = role
            attrs["taint_types"] = (
                self._taint_types_for_source(node, text) if role == "source" else []
            )
