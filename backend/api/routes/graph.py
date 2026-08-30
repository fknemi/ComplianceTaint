import logging
from typing import List, Dict, Any, Optional, Tuple
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from api.helpers import build_and_analyze_graph

logger = logging.getLogger(__name__)
router = APIRouter()

# Local in-memory cache to store graph results by (project_id, commit_id)
GRAPH_CACHE: Dict[Tuple[str, str], "GraphResponse"] = {}
MAX_CACHE_SIZE = 50


class GraphResponse(BaseModel):
    elements: List[Dict[str, Any]]


@router.get("", response_model=GraphResponse)
def get_graph(
    projectId: str = Query(..., description="Project UUID"),
    branch: str = Query("main"),
    commitId: Optional[str] = Query(None),
    apiKey: Optional[str] = Query(None, description="API key"),
):
    """
    Retrieve the graph elements for a project.
    All query parameters are in camelCase.
    """
    if apiKey in (None, "undefined", "null", ""):
        apiKey = None

    # 1. Check the local cache before running the expensive build operation
    cache_key = None
    if projectId and commitId:
        cache_key = (projectId, commitId)
        if cache_key in GRAPH_CACHE:
            logger.info(f"Graph cache hit for project {projectId} at commit {commitId}")
            return GRAPH_CACHE[cache_key]

    logger.info(f"Graph cache miss. Building graph for project {projectId}")

    try:
        graph, _ = build_and_analyze_graph(
            project_id=projectId,
            branch=branch,
            commit_id=commitId,
            api_key=apiKey,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception:
        logger.exception("Graph endpoint failed")
        raise HTTPException(status_code=500, detail="Internal server error")

    elements = []
    for node_id, attrs in graph.nodes(data=True):
        node_data = {"type": "node", "id": node_id}
        for key, value in attrs.items():
            node_data[key] = list(value) if isinstance(value, set) else value
        elements.append(node_data)

    for u, v, attrs in graph.edges(data=True):
        edge_data = {"type": "edge", "source": u, "target": v}
        edge_data.update(attrs)
        elements.append(edge_data)

    response = GraphResponse(elements=elements)

    # 2. Store the result in the cache
    if cache_key:
        if len(GRAPH_CACHE) >= MAX_CACHE_SIZE:
            # Python 3.7+ dicts preserve insertion order.
            # This pops the oldest entry to make room for the new one.
            GRAPH_CACHE.pop(next(iter(GRAPH_CACHE)))
            
        GRAPH_CACHE[cache_key] = response
        logger.info(f"Cached graph results for {cache_key}")

    return response
