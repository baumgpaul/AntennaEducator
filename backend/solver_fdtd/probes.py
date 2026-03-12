"""
FDTD field probes.

Record time-domain field values at specific locations during simulation.
Supports point, line, and plane probes for both 1-D and 2-D grids.
"""

from typing import Literal

import numpy as np


class PointProbe:
    """Record a single field component at a fixed grid point over time.

    Args:
        name: Human-readable probe name.
        ix: x-cell index.
        iy: y-cell index (0 for 1-D).
        field_component: Which field to record.
    """

    def __init__(
        self,
        name: str,
        ix: int,
        iy: int = 0,
        field_component: str = "Ez",
    ):
        self.name = name
        self.ix = ix
        self.iy = iy
        self.field_component = field_component
        self.times: list[float] = []
        self.values: list[float] = []

    def record_1d(self, Ez: np.ndarray, Hy: np.ndarray, t: float) -> None:
        """Record from 1-D field arrays."""
        self.times.append(t)
        if self.field_component == "Ez":
            self.values.append(float(Ez[self.ix]))
        elif self.field_component == "Hy":
            self.values.append(float(Hy[self.ix]))
        else:
            self.values.append(0.0)

    def record_2d(self, fields: dict[str, np.ndarray], t: float) -> None:
        """Record from 2-D field dict (keys: Ez, Hx, Hy, etc.)."""
        self.times.append(t)
        arr = fields.get(self.field_component)
        if arr is not None:
            self.values.append(float(arr[self.ix, self.iy]))
        else:
            self.values.append(0.0)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "field_component": self.field_component,
            "position": {"ix": self.ix, "iy": self.iy},
            "times": self.times,
            "values": self.values,
        }


class LineProbe:
    """Record a field component along a 1-D line at selected time steps.

    For a 1-D simulation this captures the entire spatial field.
    For 2-D, it captures a row or column.

    Args:
        name: Probe name.
        axis: 'x' or 'y'.
        index: Fixed index on the other axis (for 2-D).
        field_component: Which field to record.
    """

    def __init__(
        self,
        name: str,
        axis: Literal["x", "y"] = "x",
        index: int = 0,
        field_component: str = "Ez",
    ):
        self.name = name
        self.axis = axis
        self.index = index
        self.field_component = field_component
        self.times: list[float] = []
        self.snapshots: list[list[float]] = []

    def record_1d(self, Ez: np.ndarray, Hy: np.ndarray, t: float) -> None:
        """Record full 1-D field."""
        self.times.append(t)
        if self.field_component == "Ez":
            self.snapshots.append(Ez.tolist())
        elif self.field_component == "Hy":
            self.snapshots.append(Hy.tolist())

    def record_2d(self, fields: dict[str, np.ndarray], t: float) -> None:
        """Record a line slice from 2-D field."""
        self.times.append(t)
        arr = fields.get(self.field_component)
        if arr is None:
            return
        if self.axis == "x":
            self.snapshots.append(arr[:, self.index].tolist())
        else:
            self.snapshots.append(arr[self.index, :].tolist())

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "axis": self.axis,
            "index": self.index,
            "field_component": self.field_component,
            "times": self.times,
            "snapshots": self.snapshots,
        }


class PlaneProbe:
    """Record a 2-D field snapshot at selected time steps.

    For 2-D simulations, captures the entire field plane.

    Args:
        name: Probe name.
        field_component: Which field to record.
    """

    def __init__(self, name: str, field_component: str = "Ez"):
        self.name = name
        self.field_component = field_component
        self.times: list[float] = []
        self.snapshots: list[list[list[float]]] = []

    def record_2d(self, fields: dict[str, np.ndarray], t: float) -> None:
        """Record full 2-D field snapshot."""
        self.times.append(t)
        arr = fields.get(self.field_component)
        if arr is not None:
            self.snapshots.append(arr.tolist())

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "field_component": self.field_component,
            "times": self.times,
            "snapshots": self.snapshots,
        }
