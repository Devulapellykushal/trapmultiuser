#!/bin/bash

# ================================================
# Manual deployment script for Quake API to Cloud Run
# Uses Supabase for database (PostgreSQL)
# ================================================

set -e  # Exit on error

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"Quake-inventory-prod"}
REGION="asia-south1"
SERVICE_NAME="Quake-api"
ARTIFACT_REGISTRY="asia-south1-docker.pkg.dev"

# Supabase Database Configuration
SUPABASE_HOST="db.qbikoqlbpknwblcsconj.supabase.co"
SUPABASE_PORT="5432"
SUPABASE_DB="postgres"
SUPABASE_USER="postgres"
SUPABASE_PASSWORD="Omverma@1810"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Quake API deployment to Cloud Run${NC}"

# Check if required environment variables are set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ Error: GCP_PROJECT_ID environment variable is not set${NC}"
    echo "Please set your Google Cloud Project ID:"
    echo "export GCP_PROJECT_ID=your-project-id"
    exit 1
fi

echo -e "${YELLOW}📋 Using configuration:${NC}"
echo "  Project ID: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Service Name: $SERVICE_NAME"
echo "  Database: Supabase (${SUPABASE_HOST})"
echo ""

# Check if user is authenticated
echo -e "${YELLOW}🔐 Checking Google Cloud authentication...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${RED}❌ Not authenticated with Google Cloud${NC}"
    echo "Please run: gcloud auth login"
    exit 1
fi

# Set the project
echo -e "${YELLOW}🔧 Setting Google Cloud project...${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "${YELLOW}🔧 Ensuring required APIs are enabled...${NC}"
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Create Artifact Registry repository if it doesn't exist
echo -e "${YELLOW}📦 Creating Artifact Registry repository...${NC}"
if ! gcloud artifacts repositories describe Quake --location=$REGION --project=$PROJECT_ID &>/dev/null; then
    gcloud artifacts repositories create Quake \
        --repository-format=docker \
        --location=$REGION \
        --description="Quake Inventory Management System"
fi

# Configure Docker authentication
echo -e "${YELLOW}🔧 Configuring Docker authentication...${NC}"
gcloud auth configure-docker $ARTIFACT_REGISTRY

# Build and tag the image
echo -e "${YELLOW}🔨 Building Docker image...${NC}"
cd apps/api
IMAGE_TAG="$ARTIFACT_REGISTRY/$PROJECT_ID/Quake/$SERVICE_NAME:$(date +%s)"
LATEST_TAG="$ARTIFACT_REGISTRY/$PROJECT_ID/Quake/$SERVICE_NAME:latest"

docker build \
    --platform linux/amd64 \
    --tag "$IMAGE_TAG" \
    --tag "$LATEST_TAG" \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    .

# Push the image
echo -e "${YELLOW}📤 Pushing Docker image to Artifact Registry...${NC}"
docker push "$IMAGE_TAG"
docker push "$LATEST_TAG"

# Deploy to Cloud Run
echo -e "${YELLOW}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image="$IMAGE_TAG" \
    --region=$REGION \
    --allow-unauthenticated \
    --port=8080 \
    --memory=512Mi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=10 \
    --concurrency=80 \
    --timeout=300 \
    --set-env-vars="DJANGO_ENV=production" \
    --quiet

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')

# Health check
echo -e "${YELLOW}🏥 Performing health check...${NC}"
sleep 5  # Wait for service to be ready
if curl --fail --retry 3 --retry-delay 3 "$SERVICE_URL/health/"; then
    echo -e "${GREEN}✅ Health check passed!${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
fi

# Run database migrations directly against Supabase
echo -e "${YELLOW}🗄️ Running database migrations against Supabase...${NC}"

# Run migrations using Docker with Supabase connection
echo -e "${YELLOW}📝 Executing migrations...${NC}"
docker run --rm \
    -e DJANGO_ENV=production \
    -e POSTGRES_HOST="${SUPABASE_HOST}" \
    -e POSTGRES_PORT="${SUPABASE_PORT}" \
    -e POSTGRES_DB="${SUPABASE_DB}" \
    -e POSTGRES_USER="${SUPABASE_USER}" \
    -e POSTGRES_PASSWORD="${SUPABASE_PASSWORD}" \
    "$IMAGE_TAG" \
    python manage.py migrate --noinput

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migrations completed successfully!${NC}"
else
    echo -e "${RED}⚠️ Migration failed - please check the output above${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${GREEN}📍 Service URL: ${SERVICE_URL}${NC}"
echo ""
echo "You can now access your API at:"
echo "  🏥 Health: $SERVICE_URL/health/"
echo "  📚 API Docs: $SERVICE_URL/api/docs/"
echo "  🔐 Admin: $SERVICE_URL/admin/"
