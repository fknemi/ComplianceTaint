import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.client import APIClient

logger = logging.getLogger(__name__)
router = APIRouter()


class CommitIdRequest(BaseModel):
    projectId: str
    apiKey: Optional[str] = None
    branch: str = "main"


class CommitIdResponse(BaseModel):
    commitId: str


def fetch_commit_id(
    project_id: str,
    commit_or_branch: str,
    api_key: Optional[str] = None,
) -> Optional[str]:
    """
    Get the commit ID from the state-at endpoint from Latent Graph API.
    """
    client = APIClient(base_url="https://lgraph.dev", api_key=api_key)

    try:
        params = {"collection": "codewiki_docs"}
        response = client.get(
            f"/api/projects/{project_id}/state-at/{commit_or_branch}",
            params=params,
        )

        if isinstance(response, dict) and "body" in response:
            return response["body"].get("commit_id")

        return None

    finally:
        client.close()


@router.post("", response_model=CommitIdResponse)
def get_commit_id(request: CommitIdRequest):
    """
    Fetch the latest commit ID for a project's branch.
    """
    try:
        # We pass request.branch to the API, which resolves it to the underlying commit ID
        resolved_commit_id = fetch_commit_id(
            project_id=request.projectId,
            commit_or_branch=request.branch,
            api_key=request.apiKey,
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
