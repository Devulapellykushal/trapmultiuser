# Django Backend Deployment Guide for Render

This guide outlines the steps, environment variables, and configuration required to successfully deploy and manage the Django API on **Render**.

---

## 1. Environment Variable Configuration

For a stable, secure, and production-ready deployment, you **MUST** configure the following environment variables in the Render Dashboard settings for your Web Service:

### Required Environment Variables

| Variable | Description | Recommended Value / Example |
| :--- | :--- | :--- |
| `DJANGO_ENV` | Tells the app to load production settings | `production` |
| `DJANGO_SECRET_KEY` | High-entropy production secret key | *A long random string of alphanumeric/special characters* |
| `DATABASE_URL` | Render database URL (Supabase/Postgres) | `postgresql://<user>:<password>@<host>:<port>/<db>` |

### Recommended/Optional Environment Variables

| Variable | Description | Default Fallback (if omitted) |
| :--- | :--- | :--- |
| `DJANGO_DEBUG` | Enables/disables debug mode in production | `False` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated list of custom domains | `.onrender.com`, `localhost`, `127.0.0.1` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of frontend domains | `https://trapmultiuser-web.vercel.app` |
| `CSRF_TRUSTED_ORIGINS` | Comma-separated list of CSRF trusted referers | `https://trapmultiuser-web.vercel.app` |

---

## 2. Deployment Strategies on Render

You can deploy this API on Render using either **Native Python** or **Docker**. Both are fully supported.

### Option A: Native Python Web Service (Recommended)

When creating a new **Web Service** on Render, select **Python** as the runtime.

1. **Build Command**:
   ```bash
   pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate --noinput
   ```
   *(This ensures that packages are installed, static files are compiled, and all database migrations are applied before the new code version starts.)*

2. **Start Command**:
   ```bash
   gunicorn core.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 120
   ```

---

### Option B: Docker Container Service

When creating a new **Web Service** on Render, select **Docker** as the runtime (it will automatically detect and build the root `Dockerfile`).

* **Build & Start commands**: Fully automated via the `Dockerfile`.
* **Automatic Migrations**: The Gunicorn command in the `Dockerfile` is updated to run `python manage.py migrate --noinput` dynamically at container startup:
  ```dockerfile
  CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn core.wsgi:application --bind 0.0.0.0:${PORT} ..."]
  ```

---

## 3. Health Checks & Verification

After deployment succeeds, confirm the backend is functional by calling these endpoints:

1. **Root health check**: `https://trapmultiuser.onrender.com/` (should return `status: "ok"` and `"database": "connected"`)
2. **Detailed health check**: `https://trapmultiuser.onrender.com/health/`
3. **Swagger UI docs**: `https://trapmultiuser.onrender.com/api/docs/`
4. **Auth Endpoint**: `https://trapmultiuser.onrender.com/api/v1/auth/login/`

---

## 4. Local vs. Production Behavior

* **Local Development (`DJANGO_ENV=development` or unset)**:
  * Uses SQLite database by default (or Postgres if database credentials are configured locally).
  * CORS is allowed for `http://localhost:3000` and `http://127.0.0.1:3000` to support local frontend development.
  * Debug mode is `True` by default.
* **Production (`DJANGO_ENV=production`)**:
  * Demands `DATABASE_URL` (Supabase/PostgreSQL).
  * Debug is `False` (can be toggled using `DJANGO_DEBUG`).
  * CORS/CSRF only allows verified domains (`trapmultiuser-web.vercel.app` & custom hosts).
  * Uses WhiteNoise to compress and serve static files directly.
