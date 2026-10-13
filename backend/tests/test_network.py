"""Topology tests."""

from __future__ import annotations

from app.network import (
    ancestors,
    children_of,
    evaluation_order,
    is_leaf,
    topology,
)


def test_topology_structure():
    topo = topology()
    ids = {n["id"] for n in topo["nodes"]}
    assert {"main_inlet", "wing_a", "wing_b", "floor_a1", "floor_a2",
            "floor_b1", "floor_b2", "kitchen", "laundry", "tank"} <= ids


def test_children_relationships():
    assert set(children_of("main_inlet")) == {"wing_a", "wing_b", "kitchen", "laundry"}
    assert set(children_of("wing_b")) == {"floor_b1", "floor_b2"}


def test_ancestors():
    assert ancestors("floor_b2") == ["wing_b", "main_inlet"]


def test_leaves():
    assert is_leaf("floor_a1")
    assert is_leaf("kitchen")
    assert not is_leaf("main_inlet")


def test_evaluation_order_leaves_before_parents():
    order = evaluation_order()
    assert order.index("floor_b2") < order.index("wing_b") < order.index("main_inlet")
