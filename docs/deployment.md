# Quake Inventory - Deployment Guide

Complete guide for deploying the Quake Inventory Management System to production.

## Architecture Overview

```
┌──────────────────┐      HTTPS      ┌──────────────────┐
│   Vercel         │ ◄───────────────►│   Cloud Run      │
│   (Next.js)      │                 │   (Django API)    │
└──────────────────┘                 └────────┬─────────┘
                                              │
                                     ┌────────▼─────────┐
                                     │   Cloud SQL      │
                                     │   (PostgreSQL)   │
                                     └──────────────────┘
```

## Prerequisites

### Tools Required
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
- [Docker](https://docs.docker.com/get-docker/)
- [Node.js 20+](https://nodejs.org/)
- [Vercel CLI](https://vercel.com/cli) (`npm i -g vercel`)

### Accounts Required
- Google Cloud Platform account with billing enabled
- Vercel account
- GitHub repository with Actions enabled

---

## Backend Deployment (Google Cloud Run)

### Step 1: Set Up Google Cloud Project

```bash
# Login to gcloud
gcloud auth login

# Create or select project
gcloud projects create Quake-inventory --name="Quake Inventory"
gcloud config set project Quake-inventory

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

### Step 2: Create Cloud SQL Instance

```bash
# Create PostgreSQL instance
gcloud sql instances create Quake-postgres \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-south1 \
  --root-password=YOUR_SECURE_PASSWORD

# Create database
gcloud sql databases create Quake_inventory --instance=Quake-postgres

# Create user
gcloud sql users create Quake_user \
  --instance=Quake-postgres \
  --password=YOUR_USER_PASSWORD
```

### Step 3: Create Artifact Registry

```bash
# Create Docker repository
gcloud artifacts repositories create Quake \
  --repository-format=docker \
  --location=asia-south1 \
  --description="Quake Inventory Docker images"
```

### Step 4: Configure Secrets

```bash
# Create secrets in Secret Manager
echo -n "your-django-secret-key" | gcloud secrets create DJANGO_SECRET_KEY --data-file=-
echo -n "Quake_inventory" | gcloud secrets create POSTGRES_DB --data-file=-
echo -n "Quake_user" | gcloud secrets create POSTGRES_USER --data-file=-
echo -n "your-db-password" | gcloud secrets create POSTGRES_PASSWORD --data-file=-
echo -n "Quake-inventory:asia-south1:Quake-postgres" | gcloud secrets create CLOUD_SQL_CONNECTION_NAME --data-file=-
echo -n "your-cloud-run-url.run.app" | gcloud secrets create DJANGO_ALLOWED_HOSTS --data-file=-
echo -n "https://your-vercel-app.vercel.app" | gcloud secrets create CORS_ALLOWED_ORIGINS --data-file=-
echo -n "https://your-vercel-app.vercel.app" | gcloud secrets create CSRF_TRUSTED_ORIGINS --data-file=-
```

### Step 5: Build and Deploy

```bash
cd apps/api

# Build Docker image
docker build -t asia-south1-docker.pkg.dev/Quake-inventory/Quake/Quake-api:latest .

# Configure Docker auth
gcloud auth configure-docker asia-south1-docker.pkg.dev

# Push image
docker push asia-south1-docker.pkg.dev/Quake-inventory/Quake/Quake-api:latest

# Deploy to Cloud Run
gcloud run deploy Quake-api \
  --image asia-south1-docker.pkg.dev/Quake-inventory/Quake/Quake-api:latest \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --set-cloudsql-instances Quake-inventory:asia-south1:Quake-postgres \
  --set-env-vars "DJANGO_ENV=production" \
  --set-secrets "DJANGO_SECRET_KEY=DJANGO_SECRET_KEY:latest,POSTGRES_DB=POSTGRES_DB:latest,POSTGRES_USER=POSTGRES_USER:latest,POSTGRES_PASSWORD=POSTGRES_PASSWORD:latest,CLOUD_SQL_CONNECTION_NAME=CLOUD_SQL_CONNECTION_NAME:latest,DJANGO_ALLOWED_HOSTS=DJANGO_ALLOWED_HOSTS:latest,CORS_ALLOWED_ORIGINS=CORS_ALLOWED_ORIGINS:latest,CSRF_TRUSTED_ORIGINS=CSRF_TRUSTED_ORIGINS:latest"
```

### Step 6: Run Migrations

```bash
# Create a migration job
gcloud run jobs create Quake-migrate \
  --image asia-south1-docker.pkg.dev/Quake-inventory/Quake/Quake-api:latest \
  --region asia-south1 \
  --set-cloudsql-instances Quake-inventory:asia-south1:Quake-postgres \
  --set-env-vars "DJANGO_ENV=production" \
  --set-secrets "..." \
  --command "python" \
  --args "manage.py,migrate,--noinput"

# Execute migration job
gcloud run jobs execute Quake-migrate --region=asia-south1 --wait
```

---

## Frontend Deployment (Vercel)

### Step 1: Install & Login

```bash
npm i -g vercel
vercel login
```

### Step 2: Link Project

```bash
cd apps/web
vercel link
```

### Step 3: Configure Environment Variables

In Vercel Dashboard → Project → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_BASE_URL` | `https://Quake-api-xxxxx.asia-south1.run.app/api/v1` |

### Step 4: Deploy

```bash
# Preview deployment
vercel

# Production deployment
vercel --prod
```

---

## CI/CD Setup (GitHub Actions)

### Required Secrets

Add these secrets in GitHub → Settings → Secrets:

#### For Backend
| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_SA_KEY` | Service account JSON key |
| `CLOUD_SQL_CONNECTION_NAME` | Cloud SQL connection string |

#### For Frontend
| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Vercel API token |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `NEXT_PUBLIC_API_BASE_URL` | Production API URL |

### Create Service Account

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions"

# Grant permissions
gcloud projects add-iam-policy-binding Quake-inventory \
  --member="serviceAccount:github-actions@Quake-inventory.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding Quake-inventory \
  --member="serviceAccount:github-actions@Quake-inventory.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding Quake-inventory \
  --member="serviceAccount:github-actions@Quake-inventory.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Create and download key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions@Quake-inventory.iam.gserviceaccount.com
```

---

## Domain Configuration (Optional)

### For Cloud Run (Backend)

1. Go to Cloud Run → Quake-api → Integrations
2. Add Custom Domain
3. Follow DNS verification steps

### For Vercel (Frontend)

1. Go to Vercel → Project → Settings → Domains
2. Add your domain
3. Configure DNS records as instructed

---

## Post-Deployment Checklist

- [ ] Health check returns `{"status": "ok"}`
- [ ] Login works end-to-end
- [ ] CORS is properly configured
- [ ] HTTPS is enforced
- [ ] Database migrations are applied
- [ ] Static files are served correctly
- [ ] Logs are visible in Cloud Logging
