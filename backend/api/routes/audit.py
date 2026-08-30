import logging
from typing import List, Optional, Tuple, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.helpers import build_and_analyze_graph

logger = logging.getLogger(__name__)
router = APIRouter()

# Local in-memory cache to store audit results by (project_id, commit_id)
# Max size prevents the server memory from growing infinitely.
AUDIT_CACHE: Dict[Tuple[str, str], "AuditResponse"] = {}
MAX_CACHE_SIZE = 50


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
    commitId: str


@router.post("", response_model=AuditResponse)
def run_audit(request: AuditRequest):
    """
    Execute the compliance taint analysis and return all detected violations.
    """
    if request.commitId in ("undefined", "null", ""):
        raise HTTPException(
            status_code=400, detail="commitId is required and cannot be empty"
        )
    if request.apiKey in (None, "undefined", "null", ""):
        request.apiKey = None

    # 1. Check the local cache before running the 40-second analysis
    cache_key = None
    if request.projectId and request.commitId:
        cache_key = (request.projectId, request.commitId)
        if cache_key in AUDIT_CACHE:
            logger.info(
                f"Audit cache hit for project {request.projectId} at commit {request.commitId}"
            )
            return AUDIT_CACHE[cache_key]

    logger.info(
        f"Audit cache miss. Running full analysis for project {request.projectId}"
    )

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

    response = AuditResponse(violations=violation_responses)

    # 2. Store the result in the cache
    if cache_key:
        if len(AUDIT_CACHE) >= MAX_CACHE_SIZE:
            # Python 3.7+ dicts preserve insertion order.
            # This pops the oldest entry to make room for the new one.
            AUDIT_CACHE.pop(next(iter(AUDIT_CACHE)))

        AUDIT_CACHE[cache_key] = response
        logger.info(f"Cached audit results for {cache_key}")

    return response
