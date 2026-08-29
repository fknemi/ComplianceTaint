import logging
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from api.helpers import build_and_analyze_graph, get_api_key
logger = logging.getLogger(__name__)

router = APIRouter()


class GraphResponse(BaseModel):
    elements: List[Dict[str, Any]]


@router.get("", response_model=GraphResponse)
def get_graph(
    project_id: str = Query(..., description="Project UUID"),
    branch: str = Query("main"),
    commit_id: Optional[str] = Query(None),
    api_key: str = Depends(get_api_key),
):
    try:
        graph, _ = build_and_analyze_graph(project_id, branch, commit_id, api_key)
    except ValueError as e:
        # Known bad input / empty graph
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        # Authentication or access denied
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        # Unexpected error – log and return 500
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
