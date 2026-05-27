# ========================================
# Quake Inventory API - Production Dockerfile
# Optimized for Google Cloud Run
# ========================================

# Stage 1: Build stage
FROM python:3.11-slim as builder

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels -r requirements.txt

# ========================================
# Stage 2: Production stage
# ========================================
FROM python:3.11-slim as production

# Labels
LABEL maintainer="Quake Inventory Team"
LABEL version="1.0"
LABEL description="Quake Inventory Management API"

# Environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    # App configuration
    APP_HOME=/app \
    APP_USER=appuser \
    # Cloud Run sets PORT environment variable
    PORT=8080 \
    # CRITICAL: Set Django to use production settings
    DJANGO_ENV=production

# Create non-root user for security
RUN groupadd --gid 1000 ${APP_USER} \
    && useradd --uid 1000 --gid ${APP_USER} --shell /bin/bash --create-home ${APP_USER}

WORKDIR ${APP_HOME}

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi8 \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy wheels from builder and install
COPY --from=builder /build/wheels /wheels
RUN pip install --no-cache-dir /wheels/* \
    && rm -rf /wheels

# Copy application code
COPY --chown=${APP_USER}:${APP_USER} . .

# Create directories for static files and media
RUN mkdir -p staticfiles media \
    && chown -R ${APP_USER}:${APP_USER} staticfiles media

# Switch to non-root user
USER ${APP_USER}

# Collect static files
RUN python manage.py collectstatic --noinput --clear

# Cloud Run health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl --fail http://localhost:${PORT}/health/ || exit 1

# Expose port (Cloud Run uses PORT env var)
EXPOSE ${PORT}

# Start Gunicorn
# Cloud Run sends SIGTERM, Gunicorn handles graceful shutdown
CMD exec gunicorn core.wsgi:application \
    --bind 0.0.0.0:${PORT} \
    --workers 2 \
    --threads 4 \
    --worker-class gthread \
    --worker-tmp-dir /dev/shm \
    --timeout 120 \
    --keep-alive 5 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --access-logfile - \
    --error-logfile - \
    --capture-output \
    --enable-stdio-inheritance
