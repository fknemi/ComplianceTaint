import os
from typing import Optional, Tuple, List
from functools import lru_cache
from fastapi import HTTPException, Header
import networkx as nx

from graph.builder import GraphBuilder
from engine.tagger import Tagger
from engine.zones import assign_zones
from engine.taint import TaintEngine, Violation

def get_api_key(authorization: Optional[str] = Header(None)) -> str:
    """Extract API key from Authorization header or environment."""
    api_key = None
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization[7:]
    if not api_key:
        api_key = os.getenv("LATENT_GRAPH_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="API key missing. Provide via Authorization: Bearer <key> or set LATENT_GRAPH_API_KEY.")
    return api_key

# Internal cached wrapper so identical project/branch/commit requests skip the 40-second build
@lru_cache(maxsize=16)
def _cached_build_and_analyze(
    project_id: str,
    branch: str,
    commit_id: Optional[str],
    api_key: str,
) -> Tuple[nx.DiGraph, List[Violation]]:
    builder = GraphBuilder(
        project_id=project_id,
        branch=branch,
        commit_id=commit_id,
        api_key=api_key,
    )
    graph = builder.build()
    if graph.number_of_nodes() == 0:
        raise ValueError("Graph is empty – check project ID, branch, and API key.")
    tagger = Tagger(graph)
    tagger.tag_all()
    assign_zones(graph)
    engine = TaintEngine(graph)
    violations = engine.run()
    return graph, violations

def build_and_analyze_graph(
    project_id: str,
    branch: str,
    commit_id: Optional[str],
    api_key: str,
) -> Tuple[nx.DiGraph, List[Violation]]:
    """
    Public entrypoint. Delegates to the cached execution function 
    to prevent redundant high-latency graph builds and concurrent file fetching.
    """
    return _cached_build_and_analyze(
        project_id=project_id,
        branch=branch,
        commit_id=commit_id,
        api_key=api_key,
    )
