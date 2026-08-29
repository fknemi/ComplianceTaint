import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from mcp.client import fetch_commit_id

logger = logging.getLogger(__name__)
router = APIRouter()


class CommitIdRequest(BaseModel):
    projectId: str
    apiKey: Optional[str] = None
    branch: str = "main"


class CommitIdResponse(BaseModel):
    commitId: str


@router.post("", response_model=CommitIdResponse)
def get_commit_id_route(request: CommitIdRequest):
    """
    Fetch the latest commit ID for a project's branch.
    """
    api_key = (
        request.apiKey
        if request.apiKey not in (None, "undefined", "null", "")
        else None
    )
    try:
        # We pass request.branch to the API, which resolves it to the underlying commit ID
        resolved_commit_id = fetch_commit_id(
            project_id=request.projectId,
            commit_id=request.branch,
            api_key=api_key,
        )
        if not resolved_commit_id:
            raise HTTPException(
                status_code=404,
                detail="Commit ID not found for the given project and branch",
            )
        return CommitIdResponse(commitId=resolved_commit_id)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch commit ID endpoint")
        raise HTTPException(status_code=500, detail="Internal server error")
