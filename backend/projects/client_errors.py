"""Frontend error reports (#78).

The browser posts uncaught errors here; they are written to the Lambda log as
one ``CLIENT_ERROR`` line (CloudWatch keeps logs 7 days, see the privacy
notice) and counted by a metric filter that alarms on repeated reports
(terraform/environments/staging/alarms.tf). Nothing is stored. No login is
needed, so crashes on the login page are reported too; sizes are capped and
the Lambda's reserved concurrency limits abuse.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["client-errors"])


class ClientErrorReport(BaseModel):
    message: str = Field(..., max_length=1000)
    stack: Optional[str] = Field(None, max_length=8000)
    component_stack: Optional[str] = Field(None, max_length=8000)
    url: Optional[str] = Field(None, max_length=500)
    user_agent: Optional[str] = Field(None, max_length=500)
    kind: str = Field("error", max_length=50)  # render | error | unhandledrejection


@router.post("/client-errors", status_code=status.HTTP_204_NO_CONTENT)
async def report_client_error(report: ClientErrorReport) -> None:
    logger.warning("CLIENT_ERROR %s", json.dumps(report.model_dump(), ensure_ascii=False))
    return None
