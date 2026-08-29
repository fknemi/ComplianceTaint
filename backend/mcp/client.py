from typing import Literal, Union, Dict, Any, Optional
from api.client import APIClient


def find_symbol(
    project_id: str,
    name: str,
    kind: str = "function",
    limit: int = 20,
    branch: str = "main",
) -> Union[Dict[str, Any], str, None]:
    """
    Find symbols in the project from Latent Graph API.

    Args:
        project_id: UUID of the project
        name: Name of the symbol to find (e.g., "login")
        kind: Kind of symbol to search for (e.g., "function", "class", "variable")
        limit: Maximum number of results to return
        branch: Git branch name

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        payload = {
            "project_id": project_id,
            "branch": branch,
            "name": name,
            "kind": kind,
            "limit": limit,
        }

        response = client.post(
            "/api/v1/mcp/find-symbols", json=payload, params={"branch": branch}
        )

        return response

    finally:
        client.close()


def get_file(
    project_id: str, path: str, branch: str = "main"
) -> Union[Dict[str, Any], str, None]:
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
        payload = {"project_id": project_id, "branch": branch, "path": path}

        response = client.post(
            "/api/v1/mcp/what-is-this-file", json=payload, params={"branch": branch}
        )

        return response

    finally:
        client.close()


def list_files(
    project_id: str, branch: str = "main"
) -> Union[Dict[str, Any], str, None]:
    """
    Get a list of files from Latent Graph API.

    Args:
        project_id: UUID of the project
        branch: Git branch name

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        response = client.get(
            "/api/v1/mcp/list-files",
            params={"project_id": project_id, "branch": branch},
        )

        return response

    finally:
        client.close()


def list_modules(
    project_id: str, branch: str = "main"
) -> Union[Dict[str, Any], str, None]:
    """
    Get a list of modules from Latent Graph API.

    Args:
        project_id: UUID of the project
        branch: Git branch name

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        response = client.get(
            "/api/v1/mcp/list-modules",
            params={"project_id": project_id, "branch": branch},
        )

        return response

    finally:
        client.close()


def get_dependencies(
    project_id: str, path: str, branch: str = "main"
) -> Union[Dict[str, Any], str, None]:
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
        payload = {"project_id": project_id, "branch": branch, "path": path}

        response = client.post(
            "/api/v1/mcp/dependency", json=payload, params={"branch": branch}
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
            "/api/v1/mcp/call-chain", json=payload, params={"branch": branch}
        )

        return response

    finally:
        client.close()


def get_drg_graph_state(
    project_id: str, commit_id: str, entity_id: Optional[str] = None
) -> Union[Dict[str, Any], str, None]:
    """
    Get drg_graph state for a specific commit from Latent Graph API.

    Args:
        project_id: UUID of the project
        commit_id: Git commit hash
        entity_id: Optional entity ID to filter the collection

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        params = {"collection": "drg_graph"}
        if entity_id is not None:
            params["entity_id"] = entity_id

        response = client.get(
            f"/api/projects/{project_id}/state-at/{commit_id}",
            params=params,
        )

        return response

    finally:
        client.close()


def get_codewiki_docs_state(
    project_id: str, commit_id: str, entity_id: Optional[str] = None
) -> Union[Dict[str, Any], str, None]:
    """
    Get codewiki_docs state for a specific commit from Latent Graph API.

    Args:
        project_id: UUID of the project
        commit_id: Git commit hash
        entity_id: Optional entity ID to filter the collection

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        params = {"collection": "codewiki_docs"}
        if entity_id is not None:
            params["entity_id"] = entity_id

        response = client.get(
            f"/api/projects/{project_id}/state-at/{commit_id}",
            params=params,
        )

        return response

    finally:
        client.close()


def get_call_graph_state(
    project_id: str, commit_id: str, entity_id: Optional[str] = None
) -> Union[Dict[str, Any], str, None]:
    """
    Get call_graph state for a specific commit from Latent Graph API.

    Args:
        project_id: UUID of the project
        commit_id: Git commit hash
        entity_id: Optional entity ID to filter the collection

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        params = {"collection": "call_graph"}
        if entity_id is not None:
            params["entity_id"] = entity_id

        response = client.get(
            f"/api/projects/{project_id}/state-at/{commit_id}",
            params=params,
        )

        return response

    finally:
        client.close()


def get_coupling_scores_state(
    project_id: str, commit_id: str, entity_id: Optional[str] = None
) -> Union[Dict[str, Any], str, None]:
    """
    Get coupling_scores state for a specific commit from Latent Graph API.

    Args:
        project_id: UUID of the project
        commit_id: Git commit hash
        entity_id: Optional entity ID to filter the collection

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        params = {"collection": "coupling_scores"}
        if entity_id is not None:
            params["entity_id"] = entity_id

        response = client.get(
            f"/api/projects/{project_id}/state-at/{commit_id}",
            params=params,
        )

        return response

    finally:
        client.close()


def get_pr_insights_state(
    project_id: str, commit_id: str, entity_id: Optional[str] = None
) -> Union[Dict[str, Any], str, None]:
    """
    Get pr_insights state for a specific commit from Latent Graph API.

    Args:
        project_id: UUID of the project
        commit_id: Git commit hash
        entity_id: Optional entity ID to filter the collection

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        params = {"collection": "pr_insights"}
        if entity_id is not None:
            params["entity_id"] = entity_id

        response = client.get(
            f"/api/projects/{project_id}/state-at/{commit_id}",
            params=params,
        )

        return response

    finally:
        client.close()


def get_dep_raw_extraction_state(
    project_id: str, commit_id: str, entity_id: Optional[str] = None
) -> Union[Dict[str, Any], str, None]:
    """
    Get dep_raw_extraction state for a specific commit from Latent Graph API.

    Args:
        project_id: UUID of the project
        commit_id: Git commit hash
        entity_id: Optional entity ID to filter the collection

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        params = {"collection": "dep_raw_extraction"}
        if entity_id is not None:
            params["entity_id"] = entity_id

        response = client.get(
            f"/api/projects/{project_id}/state-at/{commit_id}",
            params=params,
        )

        return response

    finally:
        client.close()


def get_file_index_snapshots_state(
    project_id: str, commit_id: str, entity_id: Optional[str] = None
) -> Union[Dict[str, Any], str, None]:
    """
    Get file_index_snapshots state for a specific commit from Latent Graph API.

    Args:
        project_id: UUID of the project
        commit_id: Git commit hash
        entity_id: Optional entity ID to filter the collection

    Returns:
        Response data or raises exception on error
    """
    client = APIClient(base_url="https://lgraph.dev")

    try:
        params = {"collection": "file_index_snapshots"}
        if entity_id is not None:
            params["entity_id"] = entity_id

        response = client.get(
            f"/api/projects/{project_id}/state-at/{commit_id}",
            params=params,
        )

        return response

    finally:
        client.close()
