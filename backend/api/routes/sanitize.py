import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from api.helpers import build_and_analyze_graph
from engine.taint import SANITIZER_CAPABILITIES

logger = logging.getLogger(__name__)
router = APIRouter()


class SanitizeRequest(BaseModel):
    sanitizerType: str


class SanitizeResponse(BaseModel):
    status: str
    node: str
    role: str
    recommendedSanitizer: Optional[str] = None
    message: Optional[str] = None


@router.post("", response_model=SanitizeResponse)
def apply_sanitizer(
    nodeId: str = Query(
        ...,
        description="Node identifier (e.g., 'services/payment-service/paymentService.js::syncConfigToRedis')",
    ),
    request: Optional[SanitizeRequest] = None,
    projectId: str = Query(..., description="Project UUID"),
    branch: str = Query("main"),
    commitId: Optional[str] = Query(None),
    apiKey: Optional[str] = Query(None, description="API key"),
):
    """
    Suggest or apply a sanitizer for a given graph node.
    The node ID is passed as a query parameter to support slashes in file paths.
    """
    api_key = apiKey if apiKey not in (None, "undefined", "null", "") else None
    try:
        graph, _ = build_and_analyze_graph(
            project_id=projectId,
            branch=branch,
            commit_id=commitId,
            api_key=api_key,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception:
        logger.exception("Sanitizer endpoint failed")
        raise HTTPException(status_code=500, detail="Internal server error")

    if nodeId not in graph:
        similar = [
            n for n in graph.nodes if nodeId.split("::")[-1].lower() in n.lower()
        ][:5]
        detail = f"Node '{nodeId}' not found."
        if similar:
            detail += f" Did you mean one of these? {similar}"
        raise HTTPException(status_code=404, detail=detail)

    attrs = graph.nodes[nodeId]
    role = attrs.get("role", "normal")
    taint_types = attrs.get("taint_types", [])

    recommended = None
    if role == "source" and taint_types:
        for pattern, caps in SANITIZER_CAPABILITIES.items():
            if any(t in caps for t in taint_types):
                recommended = pattern.pattern
                break

    provided = request.sanitizerType if request else None
    if provided:
        message = f"Sanitizer '{provided}' accepted for node '{nodeId}'."
        status = "success"
    else:
        message = recommended or "No sanitizer required for this node."
        status = "info"

    return SanitizeResponse(
        status=status,
        node=nodeId,
        role=role,
        recommendedSanitizer=recommended,
        message=message,
    )
