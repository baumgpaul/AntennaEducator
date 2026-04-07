"""Tests for the shared logging configuration."""

import json
import logging
import os
from unittest.mock import patch

from backend.common.utils.logging_config import JsonFormatter, configure_logging


class TestConfigureLogging:
    def test_returns_named_logger(self):
        lgr = configure_logging("test-service")
        assert lgr.name == "test-service"

    def test_sets_log_level(self):
        configure_logging("test-svc", level="WARNING")
        root = logging.getLogger()
        assert root.level == logging.WARNING
        # reset
        configure_logging("test-svc", level="INFO")


class TestJsonFormatter:
    def test_json_output(self):
        fmt = JsonFormatter()
        record = logging.LogRecord(
            name="solver",
            level=logging.ERROR,
            pathname="main.py",
            lineno=42,
            msg="something broke",
            args=(),
            exc_info=None,
        )
        line = fmt.format(record)
        data = json.loads(line)
        assert data["level"] == "ERROR"
        assert data["message"] == "something broke"
        assert "timestamp" in data

    @patch.dict(os.environ, {"AWS_LAMBDA_FUNCTION_NAME": "my-lambda"})
    def test_lambda_uses_json_formatter(self):
        lgr = configure_logging("lambda-test")
        root = logging.getLogger()
        assert any(isinstance(h.formatter, JsonFormatter) for h in root.handlers)
        # cleanup
        del os.environ["AWS_LAMBDA_FUNCTION_NAME"]
        configure_logging("lambda-test")
