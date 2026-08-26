# Quake Inventory - Environment Variables Reference

Complete reference for all environment variables used in the Quake system (multi-tenant POS / inventory).

Also see repo-root `.env.example` and `apps/web/.env.example`.

---

## Backend (Django API)

### Required Variables

| Variable               | Description                                        | Example                      |
| ---------------------- | -------------------------------------------------- | ---------------------------- |
| `DJANGO_SECRET_KEY`    | Django secret key (generate unique for production) | `django-insecure-abc123...`  |
| `DJANGO_ENV`           | Environment mode                                   | `development` / `production` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated allowed hosts                      | `localhost,api.example.com`  |

### Database (prefer `DATABASE_URL`)

| Variable            | Description            | Example                               |
| ------------------- | ---------------------- | ------------------------------------- |
| `DATABASE_URL`      | Full Postgres URL      | `postgresql://USER:PASS@HOST:5432/DB` |
| `POSTGRES_DB`       | Database name          | `postgres`                            |
| `POSTGRES_USER`     | Database username      | `postgres`                            |
| `POSTGRES_PASSWORD` | Database password      | `your_password`                       |
| `POSTGRES_HOST`     | Database host          | `localhost` or managed host           |
| `POSTGRES_PORT`     | Database port          | `5432` or `6543` (pooler)             |

### Auth & email

| Variable                      | Description                          | Default / example       |
| ----------------------------- | ------------------------------------ | ----------------------- |
| `FRONTEND_URL`                | Web origin for reset / welcome links | `http://localhost:3000` |
| `AUTH_ALLOW_PUBLIC_SIGNUP`    | Enable public register               | `true`                  |
| `AUTH_DEV_RETURN_RESET_TOKEN` | Return reset token in API (dev only) | `false`                 |
| `EMAIL_ADAPTER`               | `smtp` or `console`                  | `smtp`                  |
| `SMTP_HOST` / `SMTP_PORT`     | SMTP server                          | `587`                   |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | SMTP credentials                 |                         |
| `SMTP_USE_TLS` / `SMTP_USE_SSL`   | TLS/SSL flags                    | TLS `True`              |

Public signup creates a **new organization** + ADMIN (ADR 0003).

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

| Variable                   | Description     | Example                          |
| -------------------------- | --------------- | -------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL | `https://api.example.com/api/v1` |
| `NEXT_PUBLIC_APP_NAME`     | Application name | `Quake Inventory`               |
| `NEXT_PUBLIC_APP_VERSION`  | Application version | `1.0.0`                      |

---

## Development `.env` sketch

```bash
DJANGO_SECRET_KEY=dev-secret-key-change-in-production
DJANGO_ENV=development
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
USE_SQLITE=true
FRONTEND_URL=http://localhost:3000
AUTH_ALLOW_PUBLIC_SIGNUP=true
EMAIL_ADAPTER=console
AUTH_DEV_RETURN_RESET_TOKEN=true
CORS_ALLOWED_ORIGINS=http://localhost:3000
JWT_ACCESS_TOKEN_LIFETIME=60
JWT_REFRESH_TOKEN_LIFETIME=1440
```

## Production checklist

- [ ] Unique `DJANGO_SECRET_KEY`
- [ ] `DJANGO_ENV=production` (DEBUG off)
- [ ] Hosts / CORS / CSRF match frontend
- [ ] `FRONTEND_URL` correct for password-reset links
- [ ] SMTP ready if `EMAIL_ADAPTER=smtp`
- [ ] No secrets in git
