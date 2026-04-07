"""
Shared logging configuration for all backend services.

Provides a consistent log format across every microservice:
- Plain-text in local/Docker mode (human-readable)
- JSON in Lambda mode (CloudWatch-friendly, auto-parsed)

Usage in each service ``main.py``::

    from backend.common.utils.logging_config import configure_logging
    logger = configure_logging("solver")
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Emit one JSON object per log line for CloudWatch Logs Insights."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "service": getattr(record, "service", record.name),
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj, default=str)


_PLAIN_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


def configure_logging(
    service_name: str,
    level: str = "INFO",
) -> logging.Logger:
    """Configure the root logger and return a named logger for *service_name*.

    Parameters
    ----------
    service_name:
        Human-readable service identifier (e.g. ``"solver"``).
    level:
        Log level name — ``"DEBUG"``, ``"INFO"``, ``"WARNING"``, etc.
    """
    log_level = getattr(logging, level.upper(), logging.INFO)
    is_lambda = bool(os.getenv("AWS_LAMBDA_FUNCTION_NAME"))

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if is_lambda else logging.Formatter(_PLAIN_FORMAT))

    # Reset root logger to avoid duplicate handlers across hot-reloads
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    return logging.getLogger(service_name)
