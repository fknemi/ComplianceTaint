# main.py
"""
Main entry point for Compliance Taint Analysis.

Steps:
1. Fetch the dependency graph from LatentGraph API.
2. Tag nodes as sources/sinks/sanitizers.
3. Assign compliance zones.
4. Run taint propagation and print detected violations.

Environment variables:
    LATENT_GRAPH_PROJECT_ID  (required)
    LATENT_GRAPH_BRANCH      (default: "main")
    LATENT_GRAPH_COMMIT_ID   (optional; if set, uses global call graph)
    LATENT_GRAPH_API_KEY     (required)
"""
from dotenv import load_dotenv
load_dotenv()
import os
import sys
import logging

from graph.builder import GraphBuilder
from engine.tagger import Tagger
from engine.zones import assign_zones
from engine.taint import TaintEngine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def main() -> None:
    project_id = os.getenv("LATENT_GRAPH_PROJECT_ID")
    branch = os.getenv("LATENT_GRAPH_BRANCH", "main")
    commit_id = os.getenv("LATENT_GRAPH_COMMIT_ID") or None
    api_key = os.getenv("LATENT_GRAPH_API_KEY")

    if not project_id:
        logger.error("LATENT_GRAPH_PROJECT_ID is required.")
        sys.exit(1)

    if not api_key:
        logger.error("LATENT_GRAPH_API_KEY is required.")
        sys.exit(1)

    # Build graph from LatentGraph
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
        logger.error("Graph is empty — check your project ID, branch, and API key.")
        sys.exit(1)

    logger.info(
        "Graph built with %d nodes and %d edges.",
        graph.number_of_nodes(),
        graph.number_of_edges(),
    )

    # Step 1: Tag roles and taint types
    tagger = Tagger(graph)
    tagger.tag_all()
    logger.info("Tagging complete.")

    # Step 2: Assign compliance zones
    assign_zones(graph)
    logger.info("Zone assignment complete.")

    # Step 3: Run taint engine
    engine = TaintEngine(graph)
    violations = engine.run()

    # Step 4: Print results
    print("\n" + "=" * 60)
    print(f"Detected {len(violations)} violation(s):")
    print("=" * 60)
    for i, v in enumerate(violations, 1):
        print(f"\nViolation #{i}:")
        print(f"  Rule: {v.rule_id}")
        print(f"  Description: {v.description}")
        print(f"  Severity: {v.severity}")
        print(f"  Path: {' -> '.join(v.path)}")
        if v.taint_types:
            print(f"  Taint types: {', '.join(v.taint_types)}")
        if v.crossing_zone:
            print(f"  Cross zone: {v.crossing_zone[0]} -> {v.crossing_zone[1]}")
        if v.suggestion:
            print(f"  Suggestion: {v.suggestion}")
    print("\nDone.")


if __name__ == "__main__":
    main()
