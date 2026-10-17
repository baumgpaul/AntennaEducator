"""S3 results keep complex numbers in the {real, imag} form (TEST_PLAN B48)."""

import json
from unittest.mock import MagicMock

import numpy as np
import pytest

from backend.common.storage.provider import ResultType
from backend.common.storage.s3_provider import S3ResultsProvider


@pytest.mark.asyncio
async def test_complex_values_round_trip_as_real_imag():
    client = MagicMock()
    provider = S3ResultsProvider(bucket_name="test-bucket", s3_client=client)

    data = {
        "impedance": complex(73.1, 42.5),
        "currents": np.array([1 + 2j, 3 - 4j]),
        "scalar": np.float64(1.5),
    }
    await provider.store_result("p1", ResultType.SOLVER_RESULTS, data)

    body = json.loads(client.put_object.call_args.kwargs["Body"].decode())
    assert body["impedance"] == {"real": 73.1, "imag": 42.5}
    assert body["currents"] == [{"real": 1.0, "imag": 2.0}, {"real": 3.0, "imag": -4.0}]
    assert body["scalar"] == 1.5
