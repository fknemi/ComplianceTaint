"""
Compliance Taint Analysis — full project scan.

Steps:
1. Fetch the dependency graph from LatentGraph API (call-graph + per-file deps).
2. Derive implicit broker edges from file summaries (Kafka, Redis).
3. Tag nodes as sources / sinks / log_sinks / sanitizers.
4. Assign compliance zones.
5. Run taint propagation and report all violations.

Environment variables:
    LATENT_GRAPH_PROJECT_ID   (required)
    LATENT_GRAPH_BRANCH       (default: "main")
    LATENT_GRAPH_COMMIT_ID    (optional — enables call-graph strategy)
    LATENT_GRAPH_API_KEY      (required)
"""

from dotenv import load_dotenv
load_dotenv()

import os
import sys
import logging
from collections import defaultdict

from graph.builder import GraphBuilder
from engine.tagger import Tagger
from engine.zones import assign_zones
from engine.taint import TaintEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def print_graph_summary(graph) -> None:
    print("\n" + "=" * 60)
    print("GRAPH SUMMARY")
    print("=" * 60)
    print(f"  Nodes : {graph.number_of_nodes()}")
    print(f"  Edges : {graph.number_of_edges()}")

    implicit = [
        (u, v, d)
        for u, v, d in graph.edges(data=True)
        if d.get("edge_type") == "implicit"
    ]
    print(f"  Implicit edges : {len(implicit)}")
    for u, v, d in implicit:
        print(f"    {u} -> {v}  [{d.get('data_flow_type', '?')}]")


def print_tagged_nodes(graph) -> None:
    print("\n" + "=" * 60)
    print("TAGGED NODES")
    print("=" * 60)

    by_role = defaultdict(list)
    for node, attrs in graph.nodes(data=True):
        role = attrs.get("role", "normal")
        if role != "normal":
            by_role[role].append((node, attrs))

    for role in ("source", "sink", "log_sink", "sanitizer"):
        nodes = by_role.get(role, [])
        print(f"\n  {role.upper()} ({len(nodes)})")
        for node, attrs in sorted(nodes, key=lambda x: x[0]):
            tags = attrs.get("taint_types", [])
            zone = attrs.get("compliance_zone", "?")
            tag_str = f"  tags={tags}" if tags else ""
            print(f"    [{zone}] {node}{tag_str}")


def print_violations(violations) -> None:
    print("\n" + "=" * 60)
    print(f"VIOLATIONS DETECTED: {len(violations)}")
    print("=" * 60)

    by_rule = defaultdict(list)
    for v in violations:
        by_rule[v.rule_id].append(v)

    rule_order = ["R1", "R2", "R3"]
    rule_labels = {
        "R1": "PII -> Log Sink (no sanitizer)",
        "R2": "PCI cross-zone via implicit edge",
        "R3": "Secret via implicit channel",
    }

    idx = 1
    for rule_id in rule_order:
        group = by_rule.get(rule_id, [])
        if not group:
            continue
        print(f"\n-- {rule_id}: {rule_labels[rule_id]} ({len(group)} violation(s)) --")
        for v in group:
            print(f"\n  #{idx}  Severity: {v.severity}")
            print(f"  Source : {v.source_node}")
            print(f"  Sink   : {v.sink_node}")
            print(f"  Path   : {' -> '.join(v.path)}")
            if v.taint_types:
                print(f"  Taints : {', '.join(sorted(v.taint_types))}")
            if v.crossing_zone:
                print(f"  Zones  : {v.crossing_zone[0]} -> {v.crossing_zone[1]}")
            if v.suggestion:
                print(f"  Fix    : {v.suggestion}")
            idx += 1

    for rule_id, group in by_rule.items():
        if rule_id not in rule_order:
            print(f"\n-- {rule_id} ({len(group)} violation(s)) --")
            for v in group:
                print(f"\n  #{idx}  {v.description}")
                print(f"  Path: {' -> '.join(v.path)}")
                idx += 1


def main() -> None:
    project_id = os.getenv("LATENT_GRAPH_PROJECT_ID")
    branch     = os.getenv("LATENT_GRAPH_BRANCH", "main")
    commit_id  = os.getenv("LATENT_GRAPH_COMMIT_ID") or None
    api_key    = os.getenv("LATENT_GRAPH_API_KEY")

    if not project_id:
        logger.error("LATENT_GRAPH_PROJECT_ID is required.")
        sys.exit(1)
    if not api_key:
        logger.error("LATENT_GRAPH_API_KEY is required.")
        sys.exit(1)

    # 1. Build graph (broker edges derived inside builder)
    builder = GraphBuilder(
        project_id=project_id,
        branch=branch,
        commit_id=commit_id,
    )

    try:
        logger.info("Fetching graph from LatentGraph...")
        graph = builder.build()
    except PermissionError as exc:
        logger.error("Authentication failed: %s", exc)
        sys.exit(1)

    if graph.number_of_nodes() == 0:
        logger.error("Graph is empty — check project ID, branch, and API key.")
        sys.exit(1)

    # 2. Tag roles and taint types
    tagger = Tagger(graph)
    tagger.tag_all()
    logger.info("Tagging complete.")

    # 3. Assign compliance zones
    assign_zones(graph)
    logger.info("Zone assignment complete.")

    # 4. Print summaries
    print_graph_summary(graph)
    print_tagged_nodes(graph)

    # 5. Run taint engine
    engine = TaintEngine(graph)
    violations = engine.run()

    # 6. Print violations
    print_violations(violations)

    print("\nDone.")


if __name__ == "__main__":
    main()
