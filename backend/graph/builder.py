"""
Graph Builder for Compliance Taint Analysis.

Fetches dependency graph data from the LatentGraph API and constructs
a NetworkX directed graph suitable for taint propagation.

Two strategies are supported:
1. Fetch the global call graph state (requires a commit_id).
2. Fallback: fetch dependencies file-by-file via MCP endpoints.

Node attributes (FLAT — readable directly by Tagger and TaintEngine):
    - type: "function", "file", "module", etc.
    - file: source file path
    - function: function name (if applicable)
    - role: "source", "sink", "sanitizer", "normal" (filled later by Tagger)
    - taint_types: list of taint tags (filled later by Tagger)
    - compliance_zone: zone string (filled later by assign_zones)

Edge attributes:
    - edge_type: "primary" (explicit call) or "implicit" (Kafka, Redis, DB, etc.)
    - data_flow_type: "sync", "kafka", "redis", "db", "rest", etc.
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional
from graph.broker import derive_implicit_edges

import networkx as nx

from api.client import APIError
from graph.models import NodeType, EdgeType, DataFlowType
from mcp.client import (
    get_call_graph_state,
    get_dependencies,
    fetch_files,
    list_modules,
)

logger = logging.getLogger(__name__)

# Edge types that indicate an implicit (non-direct-call) dependency
_IMPLICIT_EDGE_TYPES = frozenset({"kafka", "redis", "db", "implicit"})

# Max workers for concurrent per-file dependency fetching
_MAX_WORKERS = 2


def _normalize_edge_type(edge_type: str) -> str:
    """Return 'implicit' for async/broker edge types, 'primary' otherwise."""
    return "implicit" if edge_type in _IMPLICIT_EDGE_TYPES else "primary"


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
        api_key:   Optional API key for Latent Graph authentication.
                   If None, the underlying MCP client will attempt to
                   load it from the environment.
    """

    def __init__(
        self,
        project_id: str,
        branch: str = "main",
        commit_id: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> None:
        self.project_id = project_id
        self.branch = branch
        self.commit_id = commit_id
        self.api_key = api_key
        self.graph: nx.DiGraph = nx.DiGraph()

    @staticmethod
    def create(
        project_id: str,
        branch: str = "main",
        commit_id: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> "GraphBuilder":
        """Factory method — prefer this over direct instantiation."""
        return GraphBuilder(project_id, branch, commit_id, api_key)

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------
    def build(self) -> nx.DiGraph:
        """
        Populate and return the dependency graph.

        Strategy:
          1. If commit_id is set, fetch the full call-graph state to get
             function-level explicit edges.
          2. Always fetch per-file dependencies to add implicit edges
             (Kafka, Redis, shared DB) and any file-level dependencies
             not already present in the call graph.
          3. If call-graph fetch fails with a recoverable error, log a warning
             and proceed with per-file dependencies alone.

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
            except PermissionError:
                raise
            except (ValueError, KeyError, TypeError, OSError, APIError) as exc:
                logger.warning(
                    "Call-graph fetch failed (%s). Continuing with per-file dependencies.",
                    exc,
                )

            logger.info("Fetching per-file dependencies to add implicit edges.")
            self._build_from_per_file_dependencies()
            self._inject_broker_edges()
            return self.graph

        logger.info("Using per-file dependency strategy.")
        self._build_from_per_file_dependencies()
        self._inject_broker_edges()
        return self.graph

    # ------------------------------------------------------------------
    # Strategy 1: global call-graph state
    # ------------------------------------------------------------------
    def _build_from_call_graph_state(self, commit_id: str) -> None:
        """Fetch the complete call graph at commit_id and populate the graph."""
        logger.info("Fetching full call-graph state for commit %s", commit_id)
        data = get_call_graph_state(self.project_id, commit_id, api_key=self.api_key)

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

            self._add_call_graph_node(from_symbol, edge_info, is_source=True)
            self._add_call_graph_node(to_symbol, edge_info, is_source=False)

            raw_kind = edge_info.get("kind", "call")
            data_flow = edge_info.get("data_flow_type", raw_kind)

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
        """
        Add a function node with FLAT attributes so Tagger can read them directly.
        Previously nodes were stored as `graph.add_node(id, data=NodeData(...))`,
        which meant Tagger's attrs.get("function") always returned None.
        """
        if symbol in self.graph:
            return

        file_key = "from_file" if is_source else "to_file"
        file_path = edge_info.get(file_key, "")

        # Extract function name from symbol (e.g. "path/to/file.js::myFunction" -> "myFunction")
        function_name = symbol.split("::")[-1] if "::" in symbol else symbol

        self.graph.add_node(
            symbol,
            type=NodeType.FUNCTION.value,
            file=file_path,
            function=function_name,
            role="normal",  # filled later by Tagger
            taint_types=[],  # filled later by Tagger
            compliance_zone="",  # filled later by assign_zones
        )

        self._link_function_to_file(symbol, file_path)

    def _link_function_to_file(self, symbol: str, file_path: str) -> None:
        """Create bidirectional edges between a function and its containing file."""
        if not file_path:
            return

        self._add_file_node(file_path)

        if not self.graph.has_edge(symbol, file_path):
            self.graph.add_edge(
                symbol, file_path, edge_type="primary", data_flow_type="sync"
            )
        if not self.graph.has_edge(file_path, symbol):
            self.graph.add_edge(
                file_path, symbol, edge_type="primary", data_flow_type="sync"
            )

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
                pool.submit(
                    get_dependencies, self.project_id, path, self.branch, self.api_key
                ): path
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
        list_files returns an empty result.
        """
        try:
            raw = fetch_files(self.project_id, self.branch, api_key=self.api_key)
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
            raw = list_modules(self.project_id, self.branch, api_key=self.api_key)
            if isinstance(raw, dict):
                return _to_str_list(raw.get("modules", []))
            return _to_str_list(raw)
        except (ValueError, KeyError, TypeError, OSError, APIError) as exc:
            logger.error("list_modules failed: %s", exc)
            return []

    def _inject_broker_edges(self) -> None:
        file_paths = self._resolve_file_paths()
        edges = derive_implicit_edges(
            self.project_id, self.branch, file_paths, api_key=self.api_key
        )

        for edge in edges:
            src_file = edge["src_file"]
            src_func = edge.get("src_func")
            dst = edge["dst"]

            # Use specific publisher function node if extracted from summary
            if src_func:
                src = f"{src_file}::{src_func}"
                if src not in self.graph:
                    self.graph.add_node(
                        src,
                        type="function",
                        file=src_file,
                        function=src_func,
                        role="normal",
                        taint_types=[],
                        compliance_zone="",
                    )
                    self.graph.add_edge(
                        src, src_file, edge_type="primary", data_flow_type="sync"
                    )
                    self.graph.add_edge(
                        src_file, src, edge_type="primary", data_flow_type="sync"
                    )
            else:
                src = src_file

            if dst not in self.graph:
                self._add_file_node(dst)

            if not self.graph.has_edge(src, dst):
                self.graph.add_edge(
                    src,
                    dst,
                    edge_type="implicit",
                    data_flow_type=edge["data_flow_type"],
                )
                logger.info(
                    "Injected broker edge: %s -> %s [%s] via topic '%s'",
                    src,
                    dst,
                    edge["data_flow_type"],
                    edge.get("topic", "?"),
                )

    # ------------------------------------------------------------------
    # Graph population helpers
    # ------------------------------------------------------------------
    def _process_dependency_response(self, file_path: str, data: Any) -> None:
        """Parse a dependency payload and add nodes/edges."""
        self._add_file_node(file_path)

        if not isinstance(data, dict):
            return

        outgoing = data.get("outgoing")
        if isinstance(outgoing, list):
            for dep in outgoing:
                if not isinstance(dep, dict):
                    continue
                target = dep.get("target")
                if not target:
                    continue
                self._add_file_node(target)
                implicit = dep.get("implicit", False) or self._is_implicit_dependency(
                    target, dep.get("summary", "")
                )
                raw_type = "implicit" if implicit else "primary"
                data_flow = dep.get("data_flow") or ("implicit" if implicit else "sync")
                self.graph.add_edge(
                    file_path,
                    target,
                    edge_type=_normalize_edge_type(raw_type),
                    data_flow_type=data_flow,
                )

        incoming = data.get("incoming")
        if isinstance(incoming, list):
            for dep in incoming:
                if not isinstance(dep, dict):
                    continue
                source = dep.get("source")
                if not source:
                    continue
                self._add_file_node(source)
                implicit = dep.get("implicit", False)
                raw_type = "implicit" if implicit else "primary"
                data_flow = dep.get("data_flow") or ("implicit" if implicit else "sync")
                self.graph.add_edge(
                    source,
                    file_path,
                    edge_type=_normalize_edge_type(raw_type),
                    data_flow_type=data_flow,
                )

    def _is_implicit_dependency(self, target: str, summary: str) -> bool:
        """Heuristically decide if a dependency is implicit (Kafka, Redis, etc.)."""
        if "services/shared/" in target:
            return False

        keywords = [
            "kafka",
            "redis",
            "topic",
            "channel",
            "queue",
            "pub/sub",
            "message broker",
        ]
        target_lower = target.lower()
        summary_lower = summary.lower()
        return any(kw in target_lower or kw in summary_lower for kw in keywords)

    def _add_file_node(self, file_path: str) -> None:
        """
        Add a file node with FLAT attributes.
        Previously called with a second `data` arg that was unused; removed.
        """
        if file_path in self.graph:
            return

        # Extract a best-guess function/module name from the path
        filename = file_path.split("/")[-1]

        self.graph.add_node(
            file_path,
            type=NodeType.FILE.value,
            file=file_path,
            function=filename,  # Tagger searches this for source/sink patterns
            role="normal",  # filled later by Tagger
            taint_types=[],  # filled later by Tagger
            compliance_zone="",  # filled later by assign_zones
        )
