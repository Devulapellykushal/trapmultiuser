# Quake Inventory System

Enterprise-grade inventory management system for luxury apparel brands.

## 🏗 Project Structure

```
Quake-inventory/
├── apps/
│   ├── api/                    # Django backend (API-only)
│   │   ├── core/
│   │   │   ├── settings/       # Split settings (base, dev, prod)
│   │   │   ├── health.py       # Health check endpoint
│   │   │   └── urls.py         # URL routing
│   │   ├── manage.py
│   │   ├── requirements.txt
│   │   └── pyproject.toml
│   │
│   └── web/                    # Next.js 14 frontend
│       ├── app/                # App Router
│       ├── components/
│       ├── lib/
│       └── styles/
│
├── packages/
│   ├── ui/                     # Shared UI components (future)
│   ├── contracts/              # Shared TypeScript types (future)
│   └── utils/                  # Shared utilities (future)
│
├── infra/
│   └── postgres/               # Database setup docs
│
├── docs/
│   └── architecture/           # Architecture documentation
│
├── .env.example                # Environment template
├── pnpm-workspace.yaml         # PNPM workspace config
├── package.json                # Root package.json
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **PNPM** 8+ (`npm install -g pnpm`)
- **Python** 3.9+
- **PostgreSQL** 12+

### 1. Clone and Install Dependencies

```bash
# Install all dependencies
pnpm install
```

### 2. Database Setup

```bash
# Install PostgreSQL (macOS)
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb Quake_inventory
```

### 3. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values
# - Set POSTGRES_PASSWORD
# - Update DJANGO_SECRET_KEY for production
```

### 4. Backend Setup

```bash
# Navigate to API directory
cd apps/api

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Start development server
python manage.py runserver 0.0.0.0:8000
```

**Backend runs at:** http://localhost:8000

### 5. Frontend Setup

```bash
# From project root
pnpm dev:web
# Or from apps/web directory
cd apps/web && pnpm dev
```

**Frontend runs at:** http://localhost:3000

## 📡 API Endpoints

### Health Check

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check (root) |
| `/health/` | GET | Health check |

**Response Format:**
```json
{
  "status": "ok",
  "service": "Quake Inventory API",
  "version": "v1",
  "environment": "development",
  "database": "connected",
  "timestamp": "2026-01-13T08:00:00.000Z"
}
```

### API Documentation

| URL | Description |
|-----|-------------|
| http://localhost:8000/api/docs/ | Swagger UI |
| http://localhost:8000/api/redoc/ | ReDoc |

## 🛠 Development Commands

### Root Level

```bash
# Install all dependencies
pnpm install

# Run frontend
pnpm dev:web

# Run backend
pnpm dev:api

# Run migrations
pnpm migrate
```

### Backend (apps/api)

```bash
# Activate virtual environment
source venv/bin/activate

# Run server
python manage.py runserver

# Make migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser
```

### Frontend (apps/web)

```bash
# Development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint
pnpm lint
```

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, TypeScript, TailwindCSS |
| **Backend** | Django 4.2, Django REST Framework |
| **Database** | PostgreSQL |
| **API Docs** | drf-spectacular (Swagger/ReDoc) |
| **Package Manager** | PNPM Workspaces |

## 🔐 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DJANGO_SECRET_KEY` | Django secret key | Required |
| `DJANGO_ENV` | Environment (development/production) | development |
| `POSTGRES_DB` | Database name | Quake_inventory |
| `POSTGRES_USER` | Database user | postgres |
| `POSTGRES_PASSWORD` | Database password | Required |
| `POSTGRES_HOST` | Database host | localhost |
| `POSTGRES_PORT` | Database port | 5432 |
| `NEXT_PUBLIC_API_URL` | API URL for frontend | http://localhost:8000/api |

## 📋 Phase 1 Checklist

- ✅ PNPM monorepo structure
- ✅ Django backend with DRF
- ✅ Next.js 14 frontend with App Router
- ✅ PostgreSQL configuration
- ✅ Production-grade health endpoint
- ✅ Swagger UI & ReDoc documentation
- ✅ Split settings (development/production)
- ✅ JWT-ready configuration

## 📄 License

Private - All rights reserved.
