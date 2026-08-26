# Session lifecycle (login → stay signed in → expire → logout)

Universal rules for **tenant** (`/login`) and **platform** (`/superadmin/login`).
Scopes never share tokens; expiry of one does not redirect the other.

## Tokens

| Token | Default lifetime | Role |
|-------|------------------|------|
| Access JWT | 60 minutes (`JWT_ACCESS_TOKEN_LIFETIME`) | Authorizes API calls |
| Refresh JWT | 7 days (`JWT_REFRESH_TOKEN_LIFETIME`, minutes) | Issues new access (+ rotated refresh) |

Access expiry alone does **not** end the session. The client refreshes quietly
(on 401 and proactively ~90s before access `exp`). Refresh rotation is enabled:
each refresh returns a new refresh token and blacklists the old one.

## When the session ends

| Reason | What happened | Login banner |
|--------|---------------|--------------|
| `logout` | User signed out → refresh blacklisted, local cleared | (none) |
| `session_expired` | Refresh invalid/expired (absolute ceiling) or refresh API failed | "Your session expired…" |
| `idle` | No activity for idle window (tenant 8h / platform 4h) | "…inactivity" |
| `invalid` | Wrong account type for this portal, or corrupt tokens | "Please sign in…" |

## Client behavior

1. **Login** — store access + refresh, mark `loginAt` / `lastActivityAt`.
2. **SessionGuardian** — activity bumps idle clock; idle/refresh checks; proactive refresh.
3. **API 401** — try refresh once (per scope queue); on failure → `session_expired`.
4. **Logout** — `POST /auth/logout/` blacklists refresh → clear that scope only → its login page.

## Env

```
JWT_ACCESS_TOKEN_LIFETIME=60
JWT_REFRESH_TOKEN_LIFETIME=10080
```
