import logging
from typing import Optional, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from mcp.client import fetch_file

logger = logging.getLogger(__name__)
router = APIRouter()


class FileContentRequest(BaseModel):
    projectId: str
    path: str
    apiKey: Optional[str] = None
    branch: str = "main"


@router.post("")
def get_file_content_route(request: FileContentRequest) -> Any:
    """
    Fetch the content/information of a specific file via the Latent Graph API.
    """
    # Sanitize the API key input
    api_key = (
        request.apiKey
        if request.apiKey not in (None, "undefined", "null", "")
        else None
    )
    
    try:
        # Fetch the file info using the MCP client function
        file_data = fetch_file(
            project_id=request.projectId,
            path=request.path,
            branch=request.branch,
            api_key=api_key,
        )
        
        # Handle cases where the upstream API returns nothing
        if file_data is None:
            raise HTTPException(
                status_code=404,
                detail="File not found for the given project, branch, and path",
            )
            
        # Return the raw dictionary/string directly 
        return file_data
        
    except HTTPException:
        # Re-raise HTTP exceptions so FastAPI handles them correctly
        raise
    except Exception:
        # Log unexpected errors and return a clean 500 response
        logger.exception("Failed to fetch file content endpoint")
        raise HTTPException(status_code=500, detail="Internal server error")
