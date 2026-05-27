# Quake Inventory - Environment Variables Reference

Complete reference for all environment variables used in the Quake system.

---

## Backend (Django API)

### Required Variables

| Variable               | Description                                        | Example                      |
| ---------------------- | -------------------------------------------------- | ---------------------------- |
| `DJANGO_SECRET_KEY`    | Django secret key (generate unique for production) | `django-insecure-abc123...`  |
| `DJANGO_ENV`           | Environment mode                                   | `development` / `production` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated allowed hosts                      | `localhost,api.example.com`  |

### Database (Supabase)

| Variable            | Description            | Example                                                               |
| ------------------- | ---------------------- | --------------------------------------------------------------------- |
| `POSTGRES_DB`       | Database name          | `postgres`                                                            |
| `POSTGRES_USER`     | Database username      | `postgres`                                                            |
| `POSTGRES_PASSWORD` | Database password      | `your_supabase_password`                                              |
| `POSTGRES_HOST`     | Supabase database host | `db.<project-ref>.supabase.co` or `<project-ref>.pooler.supabase.com` |
| `POSTGRES_PORT`     | Database port          | `5432` (direct) or `6543` (pooler)                                    |

### Security

| Variable                     | Description                                 | Example                   |
| ---------------------------- | ------------------------------------------- | ------------------------- |
| `CORS_ALLOWED_ORIGINS`       | Comma-separated allowed origins             | `https://app.example.com` |
| `CSRF_TRUSTED_ORIGINS`       | Comma-separated CSRF trusted origins        | `https://app.example.com` |
| `JWT_SECRET_KEY`             | JWT signing key (optional, uses Django key) | `jwt-secret-key`          |
| `JWT_ACCESS_TOKEN_LIFETIME`  | Access token lifetime in minutes            | `60`                      |
| `JWT_REFRESH_TOKEN_LIFETIME` | Refresh token lifetime in minutes           | `1440`                    |

### Development Only

| Variable     | Description                      | Default |
| ------------ | -------------------------------- | ------- |
| `USE_SQLITE` | Use SQLite instead of PostgreSQL | `false` |

---

## Frontend (Next.js)

### Required Variables

| Variable                   | Description     | Example                          |
| -------------------------- | --------------- | -------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL | `https://api.example.com/api/v1` |

### Optional Variables

| Variable                  | Description         | Default          |
| ------------------------- | ------------------- | ---------------- |
| `NEXT_PUBLIC_APP_NAME`    | Application name    | `Quake Inventory` |
| `NEXT_PUBLIC_APP_VERSION` | Application version | `1.0.0`          |

---

## Environment Files

### Development (`.env`)

```bash
# ============================================
# Quake Inventory - Development Environment
# ============================================

# Django
DJANGO_SECRET_KEY=dev-secret-key-change-in-production
DJANGO_ENV=development
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

# Database (PostgreSQL or SQLite)
USE_SQLITE=true
# POSTGRES_DB=Quake_inventory
# POSTGRES_USER=postgres
# POSTGRES_PASSWORD=postgres
# POSTGRES_HOST=localhost
# POSTGRES_PORT=5432

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000

# JWT
JWT_ACCESS_TOKEN_LIFETIME=60
JWT_REFRESH_TOKEN_LIFETIME=1440
```

### Production (Cloud Run Secrets)

These should be stored in Google Cloud Secret Manager, NOT in files:

```bash
# Required secrets (do NOT commit these)
DJANGO_SECRET_KEY=<randomly-generated-64-char-key>

# Supabase Database
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<your-supabase-password>
POSTGRES_HOST=<project-ref>.pooler.supabase.com
POSTGRES_PORT=6543

# Hosts & CORS
DJANGO_ALLOWED_HOSTS=Quake-api-xxxxx.asia-south1.run.app
CORS_ALLOWED_ORIGINS=https://your-app.vercel.app
CSRF_TRUSTED_ORIGINS=https://your-app.vercel.app
```

---

## Generating Secrets

### Django Secret Key

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### Secure Password

```bash
openssl rand -base64 32
```

---

## Variable Validation Checklist

Before deploying, verify:

- [ ] `DJANGO_SECRET_KEY` is unique per environment
- [ ] `DEBUG` is `False` in production (set via `DJANGO_ENV=production`)
- [ ] `ALLOWED_HOSTS` includes your production domain
- [ ] `CORS_ALLOWED_ORIGINS` matches your frontend URL exactly
- [ ] `CSRF_TRUSTED_ORIGINS` matches your frontend URL exactly
- [ ] Database credentials are correct
- [ ] No secrets are committed to Git
