import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.helpers import build_and_analyze_graph

logger = logging.getLogger(__name__)
router = APIRouter()


class ViolationResponse(BaseModel):
    ruleId: str
    severity: str
    sourceNode: str
    sinkNode: str
    path: List[str]
    taintTypes: List[str]
    suggestion: str


class AuditResponse(BaseModel):
    violations: List[ViolationResponse]


class AuditRequest(BaseModel):
    projectId: str
    apiKey: Optional[str] = None
    branch: str = "main"
    commitId: Optional[str] = None


@router.post("", response_model=AuditResponse)
def run_audit(request: AuditRequest):
    """
    Execute the compliance taint analysis and return all detected violations.
    """

    try:
        _, violations = build_and_analyze_graph(
            project_id=request.projectId,
            branch=request.branch,
            commit_id=request.commitId,
            api_key=request.apiKey,  # narrowed to str here, type checker happy
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception:
        logger.exception("Audit endpoint failed")
        raise HTTPException(status_code=500, detail="Internal server error")

    violation_responses = [
        ViolationResponse(
            ruleId=v.rule_id,
            severity=v.severity,
            sourceNode=v.source_node,
            sinkNode=v.sink_node or "",
            path=v.path,
            taintTypes=list(v.taint_types),
            suggestion=v.suggestion or "",
        )
        for v in violations
    ]
    return AuditResponse(violations=violation_responses)
