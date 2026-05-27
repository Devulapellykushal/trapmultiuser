# Quake API Deployment Guide

## Quick Start

### Prerequisites

1. **Google Cloud CLI** - [Install](https://cloud.google.com/sdk/docs/install)
2. **Docker** - [Install](https://docs.docker.com/get-docker/)
3. **Google Cloud Project** - With billing enabled

### Step 1: Environment Setup

```bash
# Run the setup script to check prerequisites
./setup-env.sh

# Set your Google Cloud project ID
export GCP_PROJECT_ID=your-project-id

# Authenticate with Google Cloud (if not already done)
gcloud auth login
```

### Step 2: Deploy

```bash
# Deploy the API to Cloud Run
./deploy.sh
```

## Manual Deployment Steps

If you prefer to deploy manually, follow these steps:

### 1. Authentication

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Enable APIs

```bash
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable sqladmin.googleapis.com
```

### 3. Create Artifact Registry Repository

```bash
gcloud artifacts repositories create Quake \
    --repository-format=docker \
    --location=asia-south1 \
    --description="Quake Inventory Management System"
```

### 4. Build and Push Docker Image

```bash
cd apps/api

# Configure Docker authentication
gcloud auth configure-docker asia-south1-docker.pkg.dev

# Build the image
docker build -t asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/Quake/Quake-api:latest .

# Push the image
docker push asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/Quake/Quake-api:latest
```

### 5. Deploy to Cloud Run

```bash
gcloud run deploy Quake-api \
    --image=asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/Quake/Quake-api:latest \
    --region=asia-south1 \
    --allow-unauthenticated \
    --port=8080 \
    --memory=512Mi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=10 \
    --concurrency=80 \
    --timeout=300 \
    --set-env-vars="DJANGO_ENV=production"
```

## Environment Variables

For production deployment, you'll need to set up these environment variables in Cloud Run:

### Required Environment Variables

- `DJANGO_ENV=production`
- `DJANGO_SECRET_KEY` - Django secret key
- `POSTGRES_DB` - Database name (default: `postgres`)
- `POSTGRES_USER` - Database user (default: `postgres`)
- `POSTGRES_PASSWORD` - Supabase database password
- `POSTGRES_HOST` - Supabase host (e.g., `<project-ref>.pooler.supabase.com`)
- `POSTGRES_PORT` - Database port (use `6543` for pooler, `5432` for direct)

### Optional Environment Variables

- `DJANGO_ALLOWED_HOSTS` - Comma-separated list of allowed hosts
- `CORS_ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
- `CSRF_TRUSTED_ORIGINS` - Comma-separated list of trusted CSRF origins

## Troubleshooting

### Common Issues

1. **Service URL not accessible**
   - Check if the service is deployed: `gcloud run services list`
   - Verify the service is allowing unauthenticated access
   - Check health endpoint: `curl https://YOUR_SERVICE_URL/health/`

2. **Docker build fails**
   - Ensure you're in the `apps/api` directory
   - Check Docker is running
   - Verify all dependencies are in requirements.txt

3. **Database connection issues**
   - Verify Supabase project is running
   - Check `POSTGRES_HOST` and `POSTGRES_PORT` are correct
   - Ensure password is correct (no special characters issues)
   - For pooler: use port `6543`, for direct: use port `5432`

### Health Check Endpoints

Your deployed API will have these health check endpoints:

- Root health check: `https://YOUR_SERVICE_URL/`
- Detailed health check: `https://YOUR_SERVICE_URL/health/`

Both return JSON with:

```json
{
  "status": "ok",
  "service": "Quake Inventory API",
  "version": "v1",
  "environment": "production",
  "database": "connected",
  "timestamp": "2026-01-27T10:00:00Z"
}
```

## GitHub Actions Deployment

The repository includes GitHub Actions workflows for automated deployment:

1. **Backend workflow**: `.github/workflows/backend.yml`
   - Automatically deploys on push to master
   - Runs tests and linting
   - Builds and pushes Docker image
   - Deploys to Cloud Run

2. **Required GitHub Secrets**:
   - `GCP_PROJECT_ID` - Your Google Cloud project ID
   - `GCP_SA_KEY` - Service account JSON key
   - Database connection secrets

To trigger automatic deployment:

1. Set up the required secrets in GitHub
2. Push changes to the master branch
3. The workflow will automatically deploy your changes

## API Documentation

Once deployed, access the API documentation at:

- Swagger UI: `https://YOUR_SERVICE_URL/api/docs/`
- ReDoc: `https://YOUR_SERVICE_URL/api/redoc/`
- OpenAPI Schema: `https://YOUR_SERVICE_URL/api/schema/`
