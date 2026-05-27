# Quake Inventory System Architecture

## Overview

The Quake Inventory System is an enterprise-grade inventory management solution for luxury apparel brands.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│                    Next.js 14 (App Router)                   │
│                    http://localhost:3000                     │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Backend                               │
│                Django + Django REST Framework                │
│                    http://localhost:8000                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       Database                               │
│                      PostgreSQL                              │
│                    localhost:5432                            │
└─────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

- **apps/api**: Django backend (API-only)
- **apps/web**: Next.js frontend
- **packages/ui**: Shared UI components (future)
- **packages/contracts**: Shared TypeScript types (future)
- **packages/utils**: Shared utilities (future)

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, TailwindCSS |
| Backend | Django 4.2, Django REST Framework |
| Database | PostgreSQL |
| API Docs | drf-spectacular (Swagger/ReDoc) |
| Package Manager | PNPM Workspaces |
