"""
api/routes/report.py
Exposes endpoints to generate JSON and PDF compliance reports based on provided violations.
"""

import logging
from typing import List

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from engine.taint import Violation
from reporting.generator import generate_json_report
from reporting.pdf import generate_pdf_report

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ViolationInput(BaseModel):
    ruleId: str
    severity: str
    sourceNode: str
    sinkNode: str
    path: List[str]
    taintTypes: List[str]
    suggestion: str


class ReportRequest(BaseModel):
    projectId: str
    commitId: str
    branch: str = "main"
    violations: List[ViolationInput]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _map_to_engine_violations(violations_in: List[ViolationInput]) -> List[Violation]:
    """
    Maps the incoming Pydantic models back to the engine's Violation dataclasses
    expected by the reporting modules.
    """
    return [
        Violation(
            rule_id=v.ruleId,
            description="",
            severity=v.severity,
            source_node=v.sourceNode,
            sink_node=v.sinkNode,
            path=v.path,
            taint_types=set(v.taintTypes),
            suggestion=v.suggestion,
        )
        for v in violations_in
    ]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/json")
def create_json_report(request: ReportRequest):
    """
    Generate a structured JSON compliance report from the provided violations.
    """
    try:
        engine_violations = _map_to_engine_violations(request.violations)

        report_data = generate_json_report(
            project_id=request.projectId,
            commit_id=request.commitId,
            violations=engine_violations,
            branch=request.branch,
        )

        return report_data

    except Exception:
        logger.exception("Failed to generate JSON report")
        raise HTTPException(
            status_code=500,
            detail="Internal server error during JSON report generation",
        )


@router.post("/pdf")
def create_pdf_report(request: ReportRequest):
    """
    Generate a formatted PDF compliance report from the provided violations.
    Returns the PDF file directly as a downloadable attachment.
    """
    try:
        engine_violations = _map_to_engine_violations(request.violations)

        pdf_buffer = generate_pdf_report(
            project_id=request.projectId,
            commit_id=request.commitId,
            violations=engine_violations,
            branch=request.branch,
        )

        filename = (
            f"compliance_report_{request.projectId[:8]}_{request.commitId[:8]}.pdf"
        )

        return Response(
            content=pdf_buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except Exception:
        logger.exception("Failed to generate PDF report")
        raise HTTPException(
            status_code=500, detail="Internal server error during PDF report generation"
        )
