import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.helpers import build_and_analyze_graph, get_api_key
from engine.taint import SANITIZER_CAPABILITIES

logger = logging.getLogger(__name__)

router = APIRouter()


class SanitizeRequest(BaseModel):
    sanitizer_type: str


class SanitizeResponse(BaseModel):
    status: str
    node: str
    role: str
    recommended_sanitizer: Optional[str] = None
    message: Optional[str] = None


@router.post("/graph/nodes/sanitize", response_model=SanitizeResponse)
def apply_sanitizer(
    node_id: str = Query(
        ...,
        description="Node identifier (e.g., 'services/payment-service/paymentService.js::syncConfigToRedis')",
    ),
    request: SanitizeRequest = None,
    project_id: str = Query(..., description="Project UUID"),
    branch: str = Query("main"),
    commit_id: Optional[str] = Query(None),
    api_key: str = Depends(get_api_key),
):
    """
    Suggest or apply a sanitizer for a given graph node.
    The node_id is passed as a query parameter to support slashes in file paths.
    """
    try:
        graph, _ = build_and_analyze_graph(project_id, branch, commit_id, api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.exception("Sanitizer endpoint failed")
        raise HTTPException(status_code=500, detail="Internal server error")

    if node_id not in graph:
        # Suggest similar nodes
        similar = [
            n for n in graph.nodes if node_id.split("::")[-1].lower() in n.lower()
        ][:5]
        detail = f"Node '{node_id}' not found."
        if similar:
            detail += f" Did you mean one of these? {similar}"
        raise HTTPException(status_code=404, detail=detail)

    attrs = graph.nodes[node_id]
    role = attrs.get("role", "normal")
    taint_types = attrs.get("taint_types", [])

    recommended = None
    if role == "source" and taint_types:
        for pattern, caps in SANITIZER_CAPABILITIES.items():
            if any(t in caps for t in taint_types):
                recommended = pattern.pattern
                break

    provided = request.sanitizer_type if request else None
    if provided:
        message = f"Sanitizer '{provided}' accepted for node '{node_id}'."
        status = "success"
    else:
        message = recommended or "No sanitizer required for this node."
        status = "info"

    return SanitizeResponse(
        status=status,
        node=node_id,
        role=role,
        recommended_sanitizer=recommended,
        message=message,
    )
