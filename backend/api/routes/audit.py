import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.helpers import build_and_analyze_graph, get_api_key
logger = logging.getLogger(__name__)

router = APIRouter()


class ViolationResponse(BaseModel):
    rule_id: str
    severity: str
    source_node: str
    sink_node: str
    path: List[str]
    taint_types: List[str]
    suggestion: str


class AuditResponse(BaseModel):
    violations: List[ViolationResponse]


class AuditRequest(BaseModel):
    project_id: str
    branch: str = "main"
    commit_id: Optional[str] = None


@router.post("/run", response_model=AuditResponse)
def run_audit(
    request: AuditRequest,
    api_key: str = Depends(get_api_key),
):
    """
    Execute the compliance taint analysis and return all detected violations.
    """
    try:
        _, violations = build_and_analyze_graph(
            project_id=request.project_id,
            branch=request.branch,
            commit_id=request.commit_id,
            api_key=api_key,
        )
    except ValueError as e:
        # Raised when graph is empty or invalid input
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        # Authentication or access denied
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.exception("Audit endpoint failed")
        raise HTTPException(status_code=500, detail="Internal server error")

    violation_responses = []
    for v in violations:
        violation_responses.append(
            ViolationResponse(
                rule_id=v.rule_id,
                severity=v.severity,
                source_node=v.source_node,
                sink_node=v.sink_node or "",
                path=v.path,
                taint_types=list(v.taint_types),
                suggestion=v.suggestion or "",
            )
        )

    return AuditResponse(violations=violation_responses)
