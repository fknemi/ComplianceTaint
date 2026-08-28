from typing import Literal, Union, Dict, Any
from ..api.client import APIClient


def get_file(project_id: str, path: str, branch: str = "main") -> Union[Dict[str, Any], str, None]:
    """
    Get file information from Latent Graph API.
    
    Args:
        project_id: UUID of the project
        path: File path (e.g., "config/kafka.config.js")
        branch: Git branch name
    
    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")
    
    try:
        payload = {
            "project_id": project_id,
            "branch": branch,
            "path": path
        }
        
        response = client.post(
            "/api/v1/mcp/what-is-this-file",
            json=payload,
            params={"branch": branch}
        )
        
        return response
        
    finally:
        client.close()


def get_dependencies(project_id: str, path: str, branch: str = "main") -> Union[Dict[str, Any], str, None]:
    """
    Get dependencies for a file from Latent Graph API.
    
    Args:
        project_id: UUID of the project
        path: File path (e.g., "config/kafka.config.js")
        branch: Git branch name
    
    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")
    
    try:
        payload = {
            "project_id": project_id,
            "branch": branch,
            "path": path
        }
        
        response = client.post(
            "/api/v1/mcp/dependency",
            json=payload,
            params={"branch": branch}
        )
        
        return response
        
    finally:
        client.close()


def get_call_chain(
    project_id: str,
    symbol: str,
    direction: Literal["both", "callers", "callees"] = "both",
    depth: Literal[1, 2, 3, 4, 5] = 5,
    branch: str = "main",
) -> Union[Dict[str, Any], str, None]:
    """
    Get call chain from Latent Graph API.

    Args:
        project_id: UUID of the project
        symbol: Symbol path (e.g., "src/api/auth.py::AuthService.login")
        direction: "both", "callers", or "callees"
        depth: 1-5
        branch: Git branch name

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        payload = {
            "project_id": project_id,
            "branch": branch,
            "symbol": symbol,
            "direction": direction,
            "depth": depth,
        }

        response = client.post(
            "/api/v1/mcp/call-chain", 
            json=payload, 
            params={"branch": branch}
        )

        return response

    finally:
        client.close()


def get_code_wiki(project_id: str, branch: str = "main") -> Union[Dict[str, Any], str, None]:
    """
    Get code wiki from Latent Graph API.
    
    Args:
        project_id: UUID of the project
        branch: Git branch name
    
    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")
    
    try:
        response = client.get(
            f"/api/project/{project_id}/codewiki",
            params={"branch": branch}
        )
        
        return response
        
    finally:
        client.close()
