# Quake Inventory API

Django backend for the TRAP / Quake inventory system.

Configure the database in the repo root `.env` as **`DATABASE_URL`** (e.g. `postgresql://USER:PASSWORD@HOST:5432/DBNAME`). If `DATABASE_URL` is unset, legacy `POSTGRES_*` variables are still read.

Run migrations and the dev server from this directory (`apps/api/`):

```bash
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

After `migrate`, two dev users are ensured by migration `users.0002_seed_quake_dev_users`: `admin@thirumalawheels.com` (ADMIN) and `staff@thirumalawheels.com` (STAFF), both with password `Kushal@12`.

Package layout is explicitly declared in `pyproject.toml` so `uv` can install this project as an editable package.
