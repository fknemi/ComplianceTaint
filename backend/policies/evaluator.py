"""
Policy evaluation engine for analyzing data flow paths in a compliance taint graph.

This module provides the rules engine used to detect security and compliance
violations across a data flow graph (NetworkX). It evaluates specific paths
for policy breaches such as PII logging violations, cross-zone data leakage,
and secret exposure through implicit channels based on configurable YAML rules.
"""

import yaml
import os
import networkx as nx
from typing import List, Set, Dict, Optional


class PolicyEvaluator:
    def __init__(self, rules_path: str = "policies/rules.yaml"):
        self.rules = self._load_rules(rules_path)

    def _load_rules(self, path: str) -> List[Dict]:
        if not os.path.exists(path):
            return []
        with open(path, "r") as f:
            data = yaml.safe_load(f)
            return data.get("rules", [])

    def check_rules(
        self,
        path: List[str],
        tags: Set[str],
        origin_zone: str,
        sink_node: str,
        graph: nx.DiGraph,
    ) -> Optional[Dict]:
        sink_data = graph.nodes[sink_node]
        sink_tags = set(sink_data.get("tags", []))
        sink_zone = sink_data.get("zone", "public")

        for rule in self.rules:
            rule_id = rule.get("id")
            pattern = rule.get("pattern", {})
            metadata = rule.get("metadata", {})

            # RULE_001: PII Logging Violation
            if rule_id == "RULE_001":
                source_tag = pattern.get("source", {}).get("value")
                sink_tag = pattern.get("sink", {}).get("value")
                if source_tag in tags and sink_tag in sink_tags:
                    return {
                        "rule_id": rule_id,
                        "severity": metadata.get("severity", "High"),
                        "message": rule.get("description"),
                        "path": path,
                    }

            # RULE_002: Cross-Zone Data Leakage
            elif rule_id == "RULE_002":
                source_zone = pattern.get("source", {}).get("value")
                forbidden_zones = pattern.get("sink", {}).get("value", [])
                if origin_zone == source_zone and sink_zone in forbidden_zones and tags:
                    return {
                        "rule_id": rule_id,
                        "severity": metadata.get("severity", "Critical"),
                        "message": rule.get("description"),
                        "path": path,
                    }

            # RULE_003: Secret Exposure via Implicit Channels
            elif rule_id == "RULE_003":
                source_tag = pattern.get("source", {}).get("value")
                if source_tag in tags:
                    has_implicit = any(
                        graph.get_edge_data(path[i], path[i + 1]).get("edge_type")
                        == "implicit"
                        for i in range(len(path) - 1)
                    )
                    if has_implicit:
                        return {
                            "rule_id": rule_id,
                            "severity": metadata.get("severity", "Critical"),
                            "message": rule.get("description"),
                            "path": path,
                        }

        return None
