#!/bin/bash

# ================================================
# Environment Setup for Quake API Deployment
# ================================================

echo "🔧 Setting up environment for Quake API deployment"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud CLI is not installed"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

echo "✅ Google Cloud CLI is installed"

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "Please install it from: https://docs.docker.com/get-docker/"
    exit 1
fi

echo "✅ Docker is installed"

# Check if user is logged in to gcloud
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Not authenticated with Google Cloud"
    echo "Run: gcloud auth login"
    exit 1
fi

echo "✅ Authenticated with Google Cloud"

# List available projects
echo ""
echo "📋 Available Google Cloud projects:"
gcloud projects list --format="table(projectId:label=PROJECT_ID,name:label=PROJECT_NAME,projectNumber:label=PROJECT_NUMBER)"
echo ""

# Check if project ID is set
if [ -z "$GCP_PROJECT_ID" ]; then
    echo "⚠️  GCP_PROJECT_ID environment variable is not set"
    echo ""
    echo "To set your project ID, run:"
    echo "export GCP_PROJECT_ID=your-project-id"
    echo ""
    echo "Or add it to your ~/.bashrc or ~/.zshrc:"
    echo "echo 'export GCP_PROJECT_ID=your-project-id' >> ~/.zshrc"
    echo "source ~/.zshrc"
else
    echo "✅ GCP_PROJECT_ID is set to: $GCP_PROJECT_ID"
    
    # Verify project exists
    if gcloud projects describe "$GCP_PROJECT_ID" &>/dev/null; then
        echo "✅ Project exists and is accessible"
    else
        echo "❌ Project '$GCP_PROJECT_ID' does not exist or is not accessible"
        exit 1
    fi
fi

echo ""
echo "🔧 Required APIs that need to be enabled:"
echo "  - Cloud Run API"
echo "  - Artifact Registry API" 
echo "  - Cloud Build API"
echo "  - Cloud SQL Admin API"
echo ""

if [ ! -z "$GCP_PROJECT_ID" ]; then
    echo "🚀 Ready to deploy! Run: ./deploy.sh"
else
    echo "⚠️  Set your project ID first, then run: ./deploy.sh"
fi