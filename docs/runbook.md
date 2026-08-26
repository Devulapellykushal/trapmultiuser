# Quake Inventory - Operations Runbook

Quick reference for common operational tasks and troubleshooting.

---

## Quick Links

| Resource | URL |
|----------|-----|
| Product overview | Repo root `README.md` |
| Architecture / tenancy | `docs/architecture/README.md` |
| ADR — org tenancy & RBAC | `docs/adr/0003-organization-tenancy-rbac.md` |
| Customers (business) | `CUSTOMERS.md` |
| Env vars | `docs/env-vars.md` |
| Cloud Run Console | `https://console.cloud.google.com/run?project=Quake-inventory` |
| Vercel Dashboard | `https://vercel.com/dashboard` |

---

## Health Checks

### Backend Health

```bash
# Check if API is responding
curl https://Quake-api-xxxxx.asia-south1.run.app/api/v1/health/

# Expected response
{
  "status": "ok",
  "service": "Quake Inventory API",
  "version": "v1",
  "environment": "production",
  "database": "connected",
  "timestamp": "2026-01-14T12:00:00Z"
}
```

### Frontend Health

```bash
# Check if frontend is responding
curl -I https://your-app.vercel.app

# Expected: HTTP 200 OK
```

---

## Common Issues & Fixes

### Issue: 502 Bad Gateway

**Symptoms:** API returns 502 errors

**Possible causes:**
1. Container crashed during startup
2. Database connection failed
3. Out of memory

**Resolution:**
```bash
# Check logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=Quake-api" --limit=50

# Check if container is starting
gcloud run revisions list --service=Quake-api --region=asia-south1

# Increase memory if needed
gcloud run services update Quake-api --memory=1Gi --region=asia-south1
```

### Issue: Database Connection Refused

**Symptoms:** `"database": "disconnected"` in health check

**Resolution:**
```bash
# Check Cloud SQL instance status
gcloud sql instances describe Quake-postgres

# Verify Cloud SQL connection is configured
gcloud run services describe Quake-api --region=asia-south1 | grep cloudsql

# Check secret values
gcloud secrets versions access latest --secret=CLOUD_SQL_CONNECTION_NAME
```

### Issue: CORS Errors

**Symptoms:** Frontend shows "CORS policy" errors

**Resolution:**
```bash
# Verify CORS origins secret
gcloud secrets versions access latest --secret=CORS_ALLOWED_ORIGINS

# Update if incorrect (include https://)
echo -n "https://correct-frontend-url.vercel.app" | gcloud secrets versions add CORS_ALLOWED_ORIGINS --data-file=-

# Redeploy
gcloud run services update Quake-api --region=asia-south1
```

### Issue: 401 Unauthorized (Valid Token)

**Symptoms:** Valid JWT tokens returning 401

**Possible causes:**
1. Token expired
2. Token blacklisted
3. Secret key changed

**Resolution:**
```bash
# Check if token is blacklisted
# Connect to database and query token_blacklist_outstandingtoken

# If secret key was rotated, all tokens are invalidated (expected behavior)
# Users need to re-login
```

### Issue: Static Files 404

**Symptoms:** CSS/JS files returning 404 in production

**Resolution:**
```bash
# Ensure collectstatic was run during build
# Check Dockerfile has: RUN python manage.py collectstatic --noinput

# Verify WhiteNoise is in middleware
# Check production.py has WhiteNoise configured
```

---

## Scaling

### Manual Scaling

```bash
# Scale up (high traffic)
gcloud run services update Quake-api \
  --min-instances=2 \
  --max-instances=20 \
  --region=asia-south1

# Scale down (cost savings)
gcloud run services update Quake-api \
  --min-instances=0 \
  --max-instances=5 \
  --region=asia-south1
```

### Auto-scaling Configuration

Cloud Run auto-scales based on:
- CPU utilization (target: 60%)
- Concurrent requests (max: 80 per instance)
- Memory usage

---

## Logs

### View Backend Logs

```bash
# Recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=Quake-api" \
  --limit=100 \
  --format="table(timestamp,jsonPayload.severity,jsonPayload.message)"

# Error logs only
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=Quake-api AND severity>=ERROR" \
  --limit=50

# Specific request
gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.requestId=ABC123" \
  --limit=10
```

### View in Console

1. Go to Cloud Console → Logging → Logs Explorer
2. Select resource: Cloud Run Revision → Quake-api
3. Filter by severity as needed

---

## Deployments

### Deploy New Version

Deployments are automated via GitHub Actions when pushing to `main`.

**Manual deployment:**
```bash
cd apps/api

# Build and push
docker build -t asia-south1-docker.pkg.dev/Quake-inventory/Quake/Quake-api:manual-$(date +%Y%m%d) .
docker push asia-south1-docker.pkg.dev/Quake-inventory/Quake/Quake-api:manual-$(date +%Y%m%d)

# Deploy
gcloud run deploy Quake-api \
  --image asia-south1-docker.pkg.dev/Quake-inventory/Quake/Quake-api:manual-$(date +%Y%m%d) \
  --region asia-south1
```

### Rollback

```bash
# List recent revisions
gcloud run revisions list --service=Quake-api --region=asia-south1 --limit=5

# Rollback to specific revision
gcloud run services update-traffic Quake-api \
  --to-revisions=Quake-api-00042-abc=100 \
  --region=asia-south1
```

---

## Database Operations

### Run Migrations

```bash
# Execute migration job
gcloud run jobs execute Quake-migrate --region=asia-south1 --wait

# Check job status
gcloud run jobs executions list --job=Quake-migrate --region=asia-south1
```

### Connect to Database

```bash
# Via Cloud SQL Proxy (install first)
cloud_sql_proxy -instances=Quake-inventory:asia-south1:Quake-postgres=tcp:5432 &

# Then connect
psql -h localhost -U Quake_user -d Quake_inventory
```

### Create Superuser

```bash
# Run one-off command
gcloud run jobs create Quake-createsuperuser \
  --image asia-south1-docker.pkg.dev/Quake-inventory/Quake/Quake-api:latest \
  --set-cloudsql-instances Quake-inventory:asia-south1:Quake-postgres \
  --set-env-vars "DJANGO_ENV=production" \
  --set-secrets "..." \
  --command "python" \
  --args "manage.py,createsuperuser,--noinput,--username,admin,--email,admin@example.com"

gcloud run jobs execute Quake-createsuperuser --region=asia-south1 --wait
```

---

## Security Incidents

### Rotate Django Secret Key

```bash
# Generate new key
NEW_KEY=$(python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")

# Update secret
echo -n "$NEW_KEY" | gcloud secrets versions add DJANGO_SECRET_KEY --data-file=-

# Redeploy (invalidates all sessions/tokens)
gcloud run services update Quake-api --region=asia-south1
```

### Disable Compromised User

```bash
# Connect to database and run:
# UPDATE users_user SET is_active = FALSE WHERE email = 'compromised@example.com';
```

---

## Emergency Contacts

| Role | Contact |
|------|---------|
| On-call Engineer | [Your contact] |
| Team Lead | [Your contact] |
| GCP Support | https://cloud.google.com/support |
