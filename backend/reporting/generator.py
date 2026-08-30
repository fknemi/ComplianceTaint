"""
reporting/generator.py
Produces structured JSON reports for compliance violations.
"""

import json
from datetime import datetime, timezone
from typing import List, Dict, Any

from engine.taint import Violation


def generate_json_report(
    project_id: str,
    commit_id: str,
    violations: List[Violation],
    branch: str = "main"
) -> Dict[str, Any]:
    """
    Transforms a list of violations into a standardized JSON-serializable dictionary.
    """
    return {
        "metadata": {
            "projectId": project_id,
            "commitId": commit_id,
            "branch": branch,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "totalViolations": len(violations)
        },
        "violations": [
            {
                "ruleId": v.rule_id,
                "severity": v.severity,
                "sourceNode": v.source_node,
                "sinkNode": v.sink_node or "",
                "path": v.path,
                "taintTypes": list(v.taint_types),
                "suggestion": v.suggestion or ""
            }
            for v in violations
        ]
    }


def export_json_report(report_data: Dict[str, Any], file_path: str) -> None:
    """
    Writes the generated JSON report dictionary to a physical file.
    """
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)
