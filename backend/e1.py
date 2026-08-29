import networkx as nx
from engine.taint import TaintEngine
from engine.tagger import Tagger
from engine.zones import assign_zones

def build_sample_graph():
    G = nx.DiGraph()

    # Add nodes with attributes
    # Node 1: Source (PII) in GDPR zone
    G.add_node("UserService.getUserProfile",
               function="getUserProfile",
               file="user_service.py",
               type="function",
               role="source",
               taint_types=["pii"],
               compliance_zone="gdpr")

    # Node 2: Sink (log)
    G.add_node("UserService.logActivity",
               function="logActivity",
               file="user_service.py",
               type="function",
               role="sink",
               taint_types=[],
               compliance_zone="gdpr")

    # Edge from source to sink
    G.add_edge("UserService.getUserProfile", "UserService.logActivity")

    return G

def main():
    G = build_sample_graph()

    # Optional: if you haven't already tagged nodes, you can use Tagger and assign_zones
    # tagger = Tagger(G)
    # tagger.tag_all()
    # assign_zones(G)

    # Run taint engine
    engine = TaintEngine(G)
    violations = engine.run()

    print(f"Detected {len(violations)} violation(s):")
    for v in violations:
        print(f"Rule {v.rule_id}: {v.description}")
        print(f"  Severity: {v.severity}")
        print(f"  Path: {' -> '.join(v.path)}")
        print(f"  Taint types: {v.taint_types}")
        print(f"  Suggestion: {v.suggestion}")
        print()

if __name__ == "__main__":
    main()
