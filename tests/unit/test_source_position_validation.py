"""Unknown source positions are rejected instead of silently ignored (B20)."""

import pytest

from backend.preprocessor.builders import create_loop, create_rod

SRC = {"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}}


@pytest.mark.parametrize("position", ["center", "base", None])
def test_rod_default_feed_names(position):
    rod = create_rod(length=0.5, segments=10, source={**SRC, "position": position})
    assert (rod.sources[0].node_start, rod.sources[0].node_end) == (0, 1)


def test_rod_integer_position():
    rod = create_rod(length=0.5, segments=10, source={**SRC, "position": 3})
    assert (rod.sources[0].node_start, rod.sources[0].node_end) == (4, 5)


@pytest.mark.parametrize("position", ["middle", "top", True])
def test_rod_unknown_position_rejected(position):
    with pytest.raises(ValueError, match="Unsupported source position"):
        create_rod(length=0.5, segments=10, source={**SRC, "position": position})


@pytest.mark.parametrize("position", ["center", "gap"])
def test_loop_default_feed_names(position):
    create_loop(radius=0.1, segments=12, source={**SRC, "position": position})


def test_loop_unknown_position_rejected():
    with pytest.raises(ValueError, match="Unsupported source position"):
        create_loop(radius=0.1, segments=12, source={**SRC, "position": "base"})
