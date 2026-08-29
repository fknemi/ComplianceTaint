# graph/builder.py
"""
Graph Builder for Compliance Taint Analysis.

Fetches dependency graph data from the LatentGraph API and constructs
a NetworkX directed graph suitable for taint propagation.

Two strategies are supported:
1. Fetch the global call graph state (requires a commit_id).
2. Fallback: fetch dependencies file-by-file via MCP endpoints.

Node attributes:
    - id: string (node identifier)
    - type: "function", "file", "module", etc.
    - file: source file path
    - function: function name (if applicable)
    - role: "source", "sink", "sanitizer", "normal" (filled later by Tagger)
    - taint_types: list of taint tags (filled later by Tagger)
    - compliance_zone: zone string (filled later by assign_zones)

Edge attributes:
    - source, target
    - edge_type: "primary" (explicit call) or "implicit" (Kafka, Redis, DB, etc.)
    - data_flow_type: "sync", "kafka", "redis", "db", "rest", etc.
"""

from graph.models import NodeData, EdgeData, NodeType, EdgeType, DataFlowType
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

import networkx as nx

from api.client import APIError
from mcp.client import (
    get_call_graph_state,
    get_dependencies,
    list_files,
    list_modules,
)

logger = logging.getLogger(__name__)

# Edge types that indicate an implicit (non-direct-call) dependency
_IMPLICIT_EDGE_TYPES = frozenset({"kafka", "redis", "db", "implicit"})

# Max workers for concurrent per-file dependency fetching
_MAX_WORKERS = 10


def _normalize_edge_type(edge_type: str) -> str:
    """Return 'implicit' for async/broker edge types, 'primary' otherwise."""
    return "implicit" if edge_type in _IMPLICIT_EDGE_TYPES else "primary"


def _make_node_id(file_path: str, symbol_name: Optional[str]) -> str:
    """
    Build a stable, collision-free node ID.

    Uses 'file::symbol' when a symbol name is present so that two files
    with identically-named functions don't collapse into a single node.
    """
    if symbol_name:
        return f"{file_path}::{symbol_name}"
    return file_path


def _to_str_list(value: Any) -> List[str]:
    """
    Safely coerce an API response value to a flat list of strings.

    Accepts:
      - list of strings  → returned as-is
      - list of dicts    → skipped (not a flat file list)
      - anything else    → empty list
    """
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


class GraphBuilder:
    """
    Constructs a NetworkX directed graph from LatentGraph data.

    Args:
        project_id: LatentGraph project identifier.
        branch: Branch to index (default: "main").
        commit_id: If provided, the global call-graph state at this commit
                   is fetched first; falls back to per-file dependencies
                   only when the commit-level fetch fails with a
                   recoverable error.
    """

    def __init__(
        self,
        project_id: str,
        branch: str = "main",
        commit_id: Optional[str] = None,
    ) -> None:
        self.project_id = project_id
        self.branch = branch
        self.commit_id = commit_id
        self.graph: nx.DiGraph = nx.DiGraph()

    @staticmethod
    def create(
        project_id: str,
        branch: str = "main",
        commit_id: Optional[str] = None,
    ) -> "GraphBuilder":
        """Factory method — prefer this over direct instantiation."""
        return GraphBuilder(project_id, branch, commit_id)

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def build(self) -> nx.DiGraph:
        """
        Populate and return the dependency graph.

        Strategy:
          1. If commit_id is set, attempt to fetch the full call-graph state.
             Only falls back to per-file on recoverable errors (API/parse
             failures). Auth errors (PermissionError) are re-raised immediately
             so callers see the real problem instead of an empty graph.
          2. Otherwise, fetch dependencies file-by-file (concurrent).

        Raises:
            PermissionError: if authentication fails or access is denied.
        """
        logger.info(
            "Building graph for project %s (branch: %s, commit: %s)",
            self.project_id,
            self.branch,
            self.commit_id or "latest",
        )

        commit_id = self.commit_id
        if commit_id is not None:
            try:
                self._build_from_call_graph_state(commit_id)
                if self.graph.number_of_nodes() == 0:
                    logger.warning(
                        "Call-graph state is empty; falling back to per-file dependencies."
                    )
                    self._build_from_per_file_dependencies()
                return self.graph
            except PermissionError:
                raise
            except (ValueError, KeyError, TypeError, OSError, APIError) as exc:
                logger.warning(
                    "Call-graph fetch failed (%s). Falling back to per-file dependencies.",
                    exc,
                )
                self._build_from_per_file_dependencies()
                return self.graph

        logger.info("Using per-file dependency strategy.")
        self._build_from_per_file_dependencies()
        return self.graph

    # ------------------------------------------------------------------
    # Strategy 1: global call-graph state
    # ------------------------------------------------------------------

    def _build_from_call_graph_state(self, commit_id: str) -> None:
        """Fetch the complete call graph at commit_id and populate the graph.

        The API returns a JSON object with a ``content`` field that maps
        edge IDs to edge objects. Each edge object contains ``from_symbol``,
        ``to_symbol``, file paths, line numbers, and other metadata.
        """
        logger.info("Fetching full call-graph state for commit %s", commit_id)
        data = get_call_graph_state(self.project_id, commit_id)

        if not isinstance(data, dict):
            raise ValueError(
                f"Unexpected call-graph response type: {type(data).__name__}"
            )

        content = data.get("content")
        if not isinstance(content, dict):
            raise ValueError("Call-graph 'content' is missing or not a dictionary")

        if not content:
            logger.warning("Call-graph content is empty for commit %s", commit_id)

        for edge_id, edge_info in content.items():
            if not isinstance(edge_info, dict):
                continue

            from_symbol = edge_info.get("from_symbol")
            to_symbol = edge_info.get("to_symbol")
            if not from_symbol or not to_symbol:
                continue

            # Add nodes for source and target if they don't already exist
            self._add_call_graph_node(from_symbol, edge_info, is_source=True)
            self._add_call_graph_node(to_symbol, edge_info, is_source=False)

            # Determine edge attributes
            raw_kind = edge_info.get("kind", "call")
            data_flow = edge_info.get("data_flow_type", raw_kind)  # fallback to kind

            self.graph.add_edge(
                from_symbol,
                to_symbol,
                edge_type=_normalize_edge_type(raw_kind),
                data_flow_type=data_flow,
                line=edge_info.get("line"),
                confidence=edge_info.get("confidence"),
                resolution=edge_info.get("resolution"),
                is_external=edge_info.get("is_external", False),
                is_unresolved=edge_info.get("is_unresolved", False),
                callee_raw=edge_info.get("callee_raw"),
            )

        logger.info(
            "Call-graph: added %d node(s) and %d edge(s).",
            self.graph.number_of_nodes(),
            self.graph.number_of_edges(),
        )

    def _add_call_graph_node(
        self, symbol: str, edge_info: Dict[str, Any], is_source: bool
    ) -> None:
        """Add a single node for a call‑graph symbol, using file info if available."""
        if symbol in self.graph:
            return
        file_path = edge_info.get("from_file" if is_source else "to_file", "")
        node_data = NodeData(
            id=symbol,
            type=NodeType.FUNCTION,
            file=file_path,
            function=symbol,
        )
        self.graph.add_node(symbol, data=node_data)

    # ------------------------------------------------------------------
    # Strategy 2: per-file dependencies (concurrent)
    # ------------------------------------------------------------------

    def _build_from_per_file_dependencies(self) -> None:
        """Fetch dependencies for every file concurrently and merge into the graph."""
        file_paths = self._resolve_file_paths()
        if not file_paths:
            logger.error(
                "No files returned for project %s / branch %s. "
                "Check your project ID, branch name, and API key.",
                self.project_id,
                self.branch,
            )
            return

        logger.info(
            "Fetching dependencies for %d file(s) concurrently.", len(file_paths)
        )

        with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
            future_to_path = {
                pool.submit(get_dependencies, self.project_id, path, self.branch): path
                for path in file_paths
            }
            for future in as_completed(future_to_path):
                path = future_to_path[future]
                try:
                    deps = future.result()
                    self._process_dependency_response(path, deps)
                except (ValueError, KeyError, TypeError, OSError, APIError) as exc:
                    logger.error("Dependency fetch failed for %s: %s", path, exc)

    def _resolve_file_paths(self) -> List[str]:
        """
        Return the list of source-file paths to process.

        Tries list_files first; falls back to list_modules only when
        list_files returns an empty result (not on error), because an
        empty file list sometimes means the project uses module-level
        granularity rather than individual files.
        """
        try:
            raw = list_files(self.project_id, self.branch)
            if isinstance(raw, dict):
                paths = _to_str_list(raw.get("files", []))
            else:
                paths = _to_str_list(raw)
        except (ValueError, KeyError, TypeError, OSError, APIError) as exc:
            logger.error("list_files failed: %s", exc)
            paths = []

        if paths:
            return paths

        logger.info("list_files returned nothing — trying list_modules.")
        try:
            raw = list_modules(self.project_id, self.branch)
            if isinstance(raw, dict):
                return _to_str_list(raw.get("modules", []))
            return _to_str_list(raw)
        except (ValueError, KeyError, TypeError, OSError) as exc:
            logger.error("list_modules failed: %s", exc)
            return []

    # ------------------------------------------------------------------
    # Graph population helpers
    # ------------------------------------------------------------------

    def _process_dependency_response(self, file_path: str, data: Any) -> None:
        """Parse one dependency payload and add its nodes/edges to the graph.

        Handles multiple possible response shapes from the LatentGraph API:
          - dict with 'dependencies' as object (target -> edge metadata)
          - dict with 'dependencies' as list of edge objects
          - dict with 'implicit_dep_files' (list of file paths)
          - dict with 'edges' or 'relations'
          - list of edge objects
        """
        # Ensure the file itself exists as a node
        self._add_file_node(file_path, data)

        if isinstance(data, dict):
            # Extract dependency info from common keys
            deps = data.get("dependencies")
            if deps is None:
                deps = data.get("edges") or data.get("relations") or []

            if isinstance(deps, dict):
                # deps maps target -> metadata (or None)
                for target, metadata in deps.items():
                    if not isinstance(target, str):
                        continue
                    self._add_node_from_dep(
                        target, metadata if isinstance(metadata, dict) else {}
                    )
                    raw_type = "primary"
                    data_flow = "sync"
                    if isinstance(metadata, dict):
                        raw_type = metadata.get("type", "primary")
                        data_flow = (
                            metadata.get("data_flow_type")
                            or metadata.get("flow_type")
                            or raw_type
                        )
                    self.graph.add_edge(
                        file_path,
                        target,
                        edge_type=_normalize_edge_type(raw_type),
                        data_flow_type=data_flow,
                    )
            elif isinstance(deps, list):
                # Legacy list of edge objects
                for dep in deps:
                    if isinstance(dep, dict):
                        target = dep.get("target") or dep.get("to") or dep.get("symbol")
                        source = dep.get("source") or dep.get("from") or file_path
                        raw_type = dep.get("type", "primary")
                        data_flow = (
                            dep.get("data_flow_type")
                            or dep.get("flow_type")
                            or raw_type
                        )
                        if target:
                            self._add_node_from_dep(target, dep)
                            self.graph.add_edge(
                                source,
                                target,
                                edge_type=_normalize_edge_type(raw_type),
                                data_flow_type=data_flow,
                            )
                    elif isinstance(dep, str):
                        self.graph.add_edge(
                            file_path, dep, edge_type="primary", data_flow_type="sync"
                        )

            # Handle implicit dependencies (Kafka, Redis, shared DB, etc.)
            implicit_files = data.get("implicit_dep_files")
            if isinstance(implicit_files, list):
                for target in implicit_files:
                    if isinstance(target, str):
                        self._add_node_from_dep(target, {})
                        self.graph.add_edge(
                            file_path,
                            target,
                            edge_type="implicit",
                            data_flow_type="implicit",
                        )

        elif isinstance(data, list):
            # Top-level list of dependency items (legacy)
            for dep in data:
                if isinstance(dep, dict):
                    target = dep.get("target") or dep.get("to") or dep.get("symbol")
                    source = dep.get("source") or dep.get("from") or file_path
                    raw_type = dep.get("type", "primary")
                    data_flow = (
                        dep.get("data_flow_type") or dep.get("flow_type") or raw_type
                    )
                    if target:
                        self._add_node_from_dep(target, dep)
                        self.graph.add_edge(
                            source,
                            target,
                            edge_type=_normalize_edge_type(raw_type),
                            data_flow_type=data_flow,
                        )
                elif isinstance(dep, str):
                    self.graph.add_edge(
                        file_path, dep, edge_type="primary", data_flow_type="sync"
                    )

    def _add_nodes(self, nodes: List[Any]) -> None:
        for node in nodes:
            if not isinstance(node, dict):
                continue
            node_id = node.get("id") or node.get("name") or node.get("symbol")
            if not node_id:
                continue
            self.graph.add_node(
                node_id,
                type=node.get("type", "function"),
                file=node.get("file", ""),
                function=node.get("function", node.get("name", "")),
            )

    def _add_edges(self, edges: List[Any]) -> None:
        for edge in edges:
            if not isinstance(edge, dict):
                continue
            src = edge.get("source") or edge.get("from")
            dst = edge.get("target") or edge.get("to")
            if not src or not dst:
                continue
            raw_type = edge.get("type", "primary")
            data_flow = edge.get("data_flow_type", raw_type)
            self.graph.add_edge(
                src,
                dst,
                edge_type=_normalize_edge_type(raw_type),
                data_flow_type=data_flow,
            )

    def _add_file_node(self, file_path: str, data: Any) -> None:
        symbol_name: Optional[str] = None
        if isinstance(data, dict):
            symbol_name = data.get("symbol") or data.get("name") or data.get("function")

        node_id = _make_node_id(file_path, symbol_name)
        if node_id not in self.graph:
            self.graph.add_node(
                node_id,
                type="file",
                file=file_path,
                function=symbol_name or "",
            )

    def _add_node_from_dep(self, target: str, dep_data: Dict[str, Any]) -> None:
        if target in self.graph:
            return
        self.graph.add_node(
            target,
            type=dep_data.get("target_type", "function"),
            file=dep_data.get("target_file", ""),
            function=dep_data.get("target_name", dep_data.get("symbol", target)),
        )
