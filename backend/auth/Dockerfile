FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY backend/auth/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy entire backend directory structure (auth service needs projects modules)
COPY backend/ /app/backend/

# Set Python path
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8011

# Run the application
CMD ["uvicorn", "backend.auth.main:app", "--host", "0.0.0.0", "--port", "8011"]
