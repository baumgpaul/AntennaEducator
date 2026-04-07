"""Tests for serialization utilities — NaN/Inf handling, numpy roundtrip."""


import numpy as np
import pytest

from backend.common.utils.serialization import (
    NumpyEncoder,
    deserialize_complex,
    deserialize_numpy,
    serialize_complex,
    serialize_numpy,
)


class TestSerializeComplex:
    def test_basic_roundtrip(self):
        z = 3.0 + 4.0j
        d = serialize_complex(z)
        assert d == {"real": 3.0, "imag": 4.0}
        assert deserialize_complex(d) == z

    def test_zero(self):
        assert serialize_complex(0j) == {"real": 0.0, "imag": 0.0}

    def test_negative_parts(self):
        d = serialize_complex(-1.5 - 2.5j)
        assert d["real"] == -1.5
        assert d["imag"] == -2.5

    def test_nan_real_raises(self):
        with pytest.raises(ValueError, match="non-finite"):
            serialize_complex(complex(float("nan"), 1.0))

    def test_nan_imag_raises(self):
        with pytest.raises(ValueError, match="non-finite"):
            serialize_complex(complex(1.0, float("nan")))

    def test_inf_raises(self):
        with pytest.raises(ValueError, match="non-finite"):
            serialize_complex(complex(float("inf"), 0.0))

    def test_negative_inf_raises(self):
        with pytest.raises(ValueError, match="non-finite"):
            serialize_complex(complex(0.0, float("-inf")))


class TestSerializeNumpy:
    def test_1d_roundtrip(self):
        arr = np.array([1.0, 2.0, 3.0])
        data = serialize_numpy(arr)
        restored = deserialize_numpy(data)
        np.testing.assert_array_equal(arr, restored)

    def test_2d_roundtrip(self):
        arr = np.array([[1, 2], [3, 4]])
        data = serialize_numpy(arr)
        restored = deserialize_numpy(data)
        np.testing.assert_array_equal(arr, restored)
        assert restored.shape == (2, 2)

    def test_complex_array_roundtrip(self):
        arr = np.array([1 + 2j, 3 + 4j])
        data = serialize_numpy(arr)
        restored = deserialize_numpy(data)
        np.testing.assert_array_equal(arr, restored)

    def test_shape_mismatch_raises(self):
        data = {"data": [1, 2, 3], "dtype": "float64", "shape": (2, 2)}
        with pytest.raises(ValueError, match="Cannot reshape"):
            deserialize_numpy(data)


class TestNumpyEncoder:
    def test_encodes_int(self):
        import json

        result = json.loads(json.dumps({"v": np.int64(42)}, cls=NumpyEncoder))
        assert result["v"] == 42

    def test_encodes_float(self):
        import json

        result = json.loads(json.dumps({"v": np.float64(3.14)}, cls=NumpyEncoder))
        assert abs(result["v"] - 3.14) < 1e-10

    def test_encodes_array(self):
        import json

        result = json.loads(json.dumps({"v": np.array([1, 2])}, cls=NumpyEncoder))
        assert result["v"] == [1, 2]

    def test_encodes_complex(self):
        import json

        result = json.loads(json.dumps({"v": 1 + 2j}, cls=NumpyEncoder))
        assert result["v"] == {"real": 1.0, "imag": 2.0}
