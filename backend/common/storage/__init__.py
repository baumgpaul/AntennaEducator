"""Storage abstraction for large simulation results.

Provides S3/MinIO storage for solver and postprocessing results that exceed
DynamoDB's 400KB item size limit.
"""

from backend.common.storage.factory import get_storage_provider
from backend.common.storage.provider import ResultsStorageProvider

__all__ = ["ResultsStorageProvider", "get_storage_provider"]
