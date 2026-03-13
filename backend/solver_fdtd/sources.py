"""
FDTD source injection.

Hard and soft source injection for 1-D and 2-D FDTD grids.
A *hard* source forces the field to the source value;
a *soft* source adds the value to the existing field (transparent to
reflected waves).
"""

from backend.solver_fdtd.engine_common import evaluate_source


# ---------------------------------------------------------------------------
# 1-D source injection
# ---------------------------------------------------------------------------
def inject_source_1d(
    Ez,
    step: int,
    dt: float,
    source_index: int,
    source_type: str,
    parameters: dict,
    soft: bool = True,
):
    """Inject an E-field source into a 1-D grid.

    Args:
        Ez: 1-D E-field array (modified in-place).
        step: Current time-step index (0-based).
        dt: Time step [s].
        source_index: Cell index for injection.
        source_type: Waveform type (gaussian_pulse, sinusoidal, ...).
        parameters: Waveform parameters dict.
        soft: If True, add to field; if False, overwrite (hard source).
    """
    t = step * dt
    val = evaluate_source(source_type, t, parameters)
    if soft:
        Ez[source_index] += val
    else:
        Ez[source_index] = val


# ---------------------------------------------------------------------------
# 2-D source injection
# ---------------------------------------------------------------------------
def inject_source_2d(
    field,
    step: int,
    dt: float,
    source_ix: int,
    source_iy: int,
    source_type: str,
    parameters: dict,
    soft: bool = True,
):
    """Inject an E-field source into a 2-D grid.

    Args:
        field: 2-D field array (e.g. Ez for TM mode), modified in-place.
        step: Current time-step index (0-based).
        dt: Time step [s].
        source_ix: x-cell index for injection.
        source_iy: y-cell index for injection.
        source_type: Waveform type.
        parameters: Waveform parameters dict.
        soft: If True, add to field; if False, overwrite.
    """
    t = step * dt
    val = evaluate_source(source_type, t, parameters)
    if soft:
        field[source_ix, source_iy] += val
    else:
        field[source_ix, source_iy] = val


# ---------------------------------------------------------------------------
# Line source (plane-wave–like in 2-D)
# ---------------------------------------------------------------------------
def inject_line_source_2d(
    field,
    step: int,
    dt: float,
    axis: str,
    index: int,
    source_type: str,
    parameters: dict,
    soft: bool = True,
):
    """Inject a uniform line source across one axis of a 2-D grid.

    Useful for approximating a plane-wave excitation in 2-D.

    Args:
        field: 2-D field array, modified in-place.
        step: Current time-step.
        dt: Time step [s].
        axis: 'x' to inject along an x-column, 'y' along a y-row.
        index: Row/column index.
        source_type: Waveform type.
        parameters: Waveform parameters dict.
        soft: Add vs overwrite.
    """
    t = step * dt
    val = evaluate_source(source_type, t, parameters)
    if axis == "x":
        if soft:
            field[index, :] += val
        else:
            field[index, :] = val
    elif axis == "y":
        if soft:
            field[:, index] += val
        else:
            field[:, index] = val
    else:
        raise ValueError(f"axis must be 'x' or 'y', got '{axis}'")
