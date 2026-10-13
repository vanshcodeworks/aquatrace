"""Hotel water-network topology and meter locations.

The topology is explicit so the UI can render the exact same structure the
simulator uses. Each node has a stable id, name, type, optional parent and,
for parent nodes, a set of children derived from ``parent_id``.

Meter locations
---------------
Every node listed in ``METERED_NODES`` reports a flow reading (L/interval).
The tank node instead reports a level percentage. Nodes without a meter are
still modelled but marked ``meter=False``.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from functools import lru_cache
from typing import Dict, List, Optional

MAIN = "MAIN"
WING = "WING"
FLOOR = "FLOOR"
KITCHEN = "KITCHEN"
LAUNDRY = "LAUNDRY"
TANK = "TANK"


@dataclass(frozen=True)
class NodeDef:
    id: str
    name: str
    node_type: str
    parent_id: Optional[str] = None
    rooms: int = 0
    meter: bool = True
    # fraction of its own children that is unmetered background use
    unmetered_frac: float = 0.0
    # nominal litres/hour unmetered background use at this node
    unmetered_lph: float = 0.0


NODES: List[NodeDef] = [
    NodeDef("main_inlet", "Main Inlet", MAIN, None, meter=True),
    NodeDef("wing_a", "Wing A", WING, "main_inlet", meter=True, unmetered_lph=4.0),
    NodeDef("floor_a1", "Wing A - Floor 1", FLOOR, "wing_a", rooms=20, meter=True),
    NodeDef("floor_a2", "Wing A - Floor 2", FLOOR, "wing_a", rooms=20, meter=True),
    NodeDef("wing_b", "Wing B", WING, "main_inlet", meter=True, unmetered_lph=4.0),
    NodeDef("floor_b1", "Wing B - Floor 1", FLOOR, "wing_b", rooms=20, meter=True),
    NodeDef("floor_b2", "Wing B - Floor 2", FLOOR, "wing_b", rooms=20, meter=True),
    NodeDef("kitchen", "Kitchen", KITCHEN, "main_inlet", meter=True),
    NodeDef("laundry", "Laundry", LAUNDRY, "main_inlet", meter=True),
    NodeDef("tank", "Tank Storage", TANK, None, meter=False),
]

NODE_BY_ID: Dict[str, NodeDef] = {n.id: n for n in NODES}

LEAF_NODES = [n.id for n in NODES if n.node_type in (FLOOR, KITCHEN, LAUNDRY)]
METERED_NODES = [n.id for n in NODES if n.meter]
FLOW_NODES = [n.id for n in NODES if n.node_type != TANK]
TANK_NODE = "tank"

# Root flow meters (children of none but main_inlet and tank)
ROOTS = ["main_inlet"]


def children_of(node_id: str) -> List[str]:
    return [n.id for n in NODES if n.parent_id == node_id]


def parent_of(node_id: str) -> Optional[str]:
    node = NODE_BY_ID.get(node_id)
    return node.parent_id if node else None


def ancestors(node_id: str) -> List[str]:
    out: List[str] = []
    cur = parent_of(node_id)
    while cur is not None:
        out.append(cur)
        cur = parent_of(cur)
    return out


def descendants(node_id: str) -> List[str]:
    out: List[str] = []
    stack = list(children_of(node_id))
    while stack:
        cur = stack.pop()
        out.append(cur)
        stack.extend(children_of(cur))
    return out


def is_leaf(node_id: str) -> bool:
    return node_id in LEAF_NODES


def topology() -> dict:
    """Serialisable topology for the API."""
    return {
        "nodes": [
            {
                **asdict(n),
                "children": children_of(n.id),
                "is_leaf": is_leaf(n.id),
            }
            for n in NODES
        ],
        "roots": ROOTS,
        "tank_node": TANK_NODE,
        "unit": "L/interval",
        "interval_minutes": 15,
    }


# Topological order: leaves first, then parents (so mass-balance can be computed
# bottom-up in a single pass).
@lru_cache(maxsize=1)
def evaluation_order() -> List[str]:
    order: List[str] = []
    seen = set()

    def visit(nid: str) -> None:
        for c in children_of(nid):
            visit(c)
        if nid not in seen:
            seen.add(nid)
            order.append(nid)

    for root in ROOTS:
        visit(root)
    # include any node not reachable from roots (e.g. tank)
    for n in NODES:
        if n.id not in seen:
            order.append(n.id)
    return order

