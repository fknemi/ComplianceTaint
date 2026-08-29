"""
graph/models.py

Defines the data models for nodes and edges used throughout the
Compliance Taint Analysis pipeline.

These dataclasses are designed to be stored as attributes on a
NetworkX DiGraph (via the `data` attribute of nodes/edges) and
provide a consistent interface for the tagger, taint engine,
zone assignment, and reporting modules.
"""

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Dict, Any, Optional, List


class NodeType(str, Enum):
    """Broad category of a graph node."""
    FUNCTION = "function"
    FILE = "file"
    MODULE = "module"


class NodeRole(str, Enum):
    """Role assigned during the tagging phase."""
    SOURCE = "source"
    SINK = "sink"
    SANITIZER = "sanitizer"
    NORMAL = "normal"


class TaintStatus(str, Enum):
    """Taint propagation state."""
    CLEAN = "clean"
    TAINTED = "tainted"
    SANITIZED = "sanitized"   # taint neutralized by a sanitizer


class ComplianceZone(str, Enum):
    """Regulatory zones for cross-boundary checks."""
    PCI = "pci"
    GDPR = "gdpr"
    RBI = "rbi"
    PUBLIC = "public"
    UNKNOWN = "unknown"       # fallback when zone not determined


class EdgeType(str, Enum):
    """Indicates whether an edge is a direct call or an implicit coupling."""
    PRIMARY = "primary"       # explicit function call / import
    IMPLICIT = "implicit"     # Kafka, Redis, shared DB, etc.


class DataFlowType(str, Enum):
    """Describes the medium of data transfer."""
    SYNC = "sync"             # direct function call
    KAFKA = "kafka"
    REDIS = "redis"
    DB = "db"
    REST = "rest"
    IMPLICIT = "implicit"     # generic implicit edge
    UNKNOWN = "unknown"


@dataclass
class NodeData:
    """
    Attributes stored on a NetworkX node.

    All fields have sensible defaults so that partially‑tagged
    nodes can still be processed.
    """
    id: str                                  # unique node identifier
    type: NodeType = NodeType.FUNCTION       # node category
    file: str = ""                           # source file path
    function: str = ""                       # function/method name (if any)
    role: NodeRole = NodeRole.NORMAL         # filled by tagger
    taint_types: List[str] = field(default_factory=list)  # e.g., ["pii", "secret"]
    taint_status: TaintStatus = TaintStatus.CLEAN        # filled by taint engine
    compliance_zone: ComplianceZone = ComplianceZone.UNKNOWN  # filled by zone assigner

    def to_dict(self) -> Dict[str, Any]:
        """Convert to a JSON‑serialisable dictionary (enums become strings)."""
        d = asdict(self)
        # Convert enums to their string values
        d["type"] = self.type.value
        d["role"] = self.role.value
        d["taint_status"] = self.taint_status.value
        d["compliance_zone"] = self.compliance_zone.value
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "NodeData":
        """Create a NodeData instance from a dictionary (accepts strings or enums)."""
        # Helper to convert string to Enum or keep Enum
        def _enum(enum_cls, val):
            if isinstance(val, enum_cls):
                return val
            if isinstance(val, str):
                try:
                    return enum_cls(val)
                except ValueError:
                    return enum_cls.UNKNOWN  # fallback
            return enum_cls.UNKNOWN

        return cls(
            id=data.get("id", ""),
            type=_enum(NodeType, data.get("type", NodeType.FUNCTION)),
            file=data.get("file", ""),
            function=data.get("function", ""),
            role=_enum(NodeRole, data.get("role", NodeRole.NORMAL)),
            taint_types=data.get("taint_types", []),
            taint_status=_enum(TaintStatus, data.get("taint_status", TaintStatus.CLEAN)),
            compliance_zone=_enum(ComplianceZone, data.get("compliance_zone", ComplianceZone.UNKNOWN)),
        )


@dataclass
class EdgeData:
    """
    Attributes stored on a NetworkX edge.
    """
    source: str                              # source node ID
    target: str                              # target node ID
    edge_type: EdgeType = EdgeType.PRIMARY   # primary or implicit
    data_flow_type: DataFlowType = DataFlowType.SYNC
    line: Optional[int] = None               # line number (if known)
    confidence: float = 1.0                  # analysis confidence (0-1)
    resolution: str = ""                     # how the edge was resolved
    is_external: bool = False                # target is external library?
    is_unresolved: bool = False              # target not found?
    callee_raw: str = ""                     # raw callee name

    def to_dict(self) -> Dict[str, Any]:
        """Convert to a JSON‑serialisable dictionary."""
        d = asdict(self)
        d["edge_type"] = self.edge_type.value
        d["data_flow_type"] = self.data_flow_type.value
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EdgeData":
        """Create an EdgeData instance from a dictionary."""
        def _enum(enum_cls, val, default):
            if isinstance(val, enum_cls):
                return val
            if isinstance(val, str):
                try:
                    return enum_cls(val)
                except ValueError:
                    return default
            return default

        return cls(
            source=data.get("source", ""),
            target=data.get("target", ""),
            edge_type=_enum(EdgeType, data.get("edge_type", EdgeType.PRIMARY), EdgeType.PRIMARY),
            data_flow_type=_enum(DataFlowType, data.get("data_flow_type", DataFlowType.SYNC), DataFlowType.SYNC),
            line=data.get("line"),
            confidence=data.get("confidence", 1.0),
            resolution=data.get("resolution", ""),
            is_external=data.get("is_external", False),
            is_unresolved=data.get("is_unresolved", False),
            callee_raw=data.get("callee_raw", ""),
        )
