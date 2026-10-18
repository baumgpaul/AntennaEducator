"""Run async work from a synchronous Lambda handler without breaking Mangum."""

import asyncio
from collections.abc import Coroutine
from typing import Any, TypeVar

T = TypeVar("T")


def run_coroutine(coro: Coroutine[Any, Any, T]) -> T:
    """Run ``coro`` to completion on a private event loop.

    Not ``asyncio.run()``: it unsets the thread's current event loop when it
    finishes, so the next HTTP request handled by the same warm Lambda instance
    fails inside Mangum with "There is no current event loop" (a 502 for the
    client). A private loop leaves the current loop untouched.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.run_until_complete(loop.shutdown_asyncgens())
        loop.close()
