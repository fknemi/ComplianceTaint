import logging
from typing import Optional, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from mcp.client import fetch_files

logger = logging.getLogger(__name__)
router = APIRouter()


class ListFilesRequest(BaseModel):
    projectId: str
    apiKey: Optional[str] = None
    branch: str = "main"


@router.post("")
def list_files_route(request: ListFilesRequest) -> Any:
    """
    Fetch the list of files for a project's branch via the Latent Graph API.
    """
    # Sanitize the API key input
    api_key = (
        request.apiKey
        if request.apiKey not in (None, "undefined", "null", "")
        else None
    )
    
    try:
        # Fetch the file list using the MCP client function
        files_data = fetch_files(
            project_id=request.projectId,
            branch=request.branch,
            api_key=api_key,
        )
        
        # Handle cases where the upstream API returns nothing
        if files_data is None:
            raise HTTPException(
                status_code=404,
                detail="No files found for the given project and branch",
            )
            
        # Return the raw dictionary/list directly 
        return files_data
        
    except HTTPException:
        # Re-raise HTTP exceptions so FastAPI handles them correctly
        raise
    except Exception:
        # Log unexpected errors and return a clean 500 response
        logger.exception("Failed to fetch files endpoint")
        raise HTTPException(status_code=500, detail="Internal server error")
