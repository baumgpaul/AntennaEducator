"""
Global error handler for FastAPI services.

Provides:
- Correlation IDs on every response (X-Request-ID header)
- Global exception handler to prevent stack-trace leaks in 500 responses
- Consistent error-response shape: ``{"detail": "..."}``
"""

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a correlation ID and catch unhandled exceptions."""

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = request_id
        try:
            response = await call_next(request)
        except (StarletteHTTPException, RequestValidationError):
            # Let FastAPI's built-in handlers deal with HTTP/validation errors
            raise
        except Exception as exc:
            logger.exception(
                "Unhandled exception [request_id=%s]: %s",
                request_id,
                exc,
            )
            response = JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"},
            )
        response.headers["X-Request-ID"] = request_id
        return response


def install_error_handlers(app: FastAPI) -> None:
    """Register the correlation-ID middleware and global exception handler."""
    app.add_middleware(RequestIdMiddleware)
