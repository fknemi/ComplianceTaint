import networkx as nx
from engine.taint import TaintEngine

def build_graph_rule3():
    G = nx.DiGraph()

    # AuthService.readSecret (secret source, in PCI zone, but we can use public)
    G.add_node(
        "AuthService.readSecret",
        function="readSecret",
        file="auth_service.py",
        role="source",
        taint_types=["secret"],
        compliance_zone="pci",
    )

    # NotificationService.sendNotification (public zone, sink)
    G.add_node(
        "NotificationService.sendNotification",
        function="sendNotification",
        file="notification_service.py",
        role="sink",
        taint_types=[],
        compliance_zone="public",
    )

    # Implicit Redis edge
    G.add_edge(
        "AuthService.readSecret",
        "NotificationService.sendNotification",
        edge_type="implicit",
    )

    return G

if __name__ == "__main__":
    G = build_graph_rule3()
    engine = TaintEngine(G)
    violations = engine.run()
    for v in violations:
        print(f"Rule {v.rule_id}: {v.description}")
        print(f"  Path: {' -> '.join(v.path)}")
        print(f"  Taint types: {v.taint_types}")
        print()
