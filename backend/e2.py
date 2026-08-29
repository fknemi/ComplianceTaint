import networkx as nx
from engine.taint import TaintEngine

def build_graph_rule2():
    G = nx.DiGraph()

    # PaymentService.processPayment (PCI zone, source)
    G.add_node(
        "PaymentService.processPayment",
        function="processPayment",
        file="payment_service.py",
        role="source",
        taint_types=["pci"],
        compliance_zone="pci",
    )

    # AnalyticsService.consumeTransactions (public zone, sink)
    G.add_node(
        "AnalyticsService.consumeTransactions",
        function="consumeTransactions",
        file="analytics_service.py",
        role="sink",
        taint_types=[],
        compliance_zone="public",
    )

    # Implicit Kafka edge
    G.add_edge(
        "PaymentService.processPayment",
        "AnalyticsService.consumeTransactions",
        edge_type="implicit",
    )

    return G

if __name__ == "__main__":
    G = build_graph_rule2()
    engine = TaintEngine(G)
    violations = engine.run()
    for v in violations:
        print(f"Rule {v.rule_id}: {v.description}")
        print(f"  Path: {' -> '.join(v.path)}")
        print(f"  Cross zone: {v.crossing_zone}")
        print()
