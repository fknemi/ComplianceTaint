import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from api.helpers import build_and_analyze_graph

logger = logging.getLogger(__name__)
router = APIRouter()


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

    return GraphResponse(elements=elements)
