# Love Parser Frontend

Vite + React 18 single-page application (and Telegram Mini App shell) that consumes the Love Parser backend APIs.

## Quick start

1. Install workspace dependencies from the repo root: `corepack enable pnpm && pnpm install`.
2. Copy environment defaults: `cp frontend/.env.example frontend/.env` and set `VITE_API_URL` to your backend (e.g., `http://localhost:3000`).
3. Launch the dev server:
   ```bash
   pnpm --filter @love-parser/frontend dev
   ```
4. Open `http://localhost:5173` (or Vite’s printed URL). The frontend proxies API calls to `VITE_API_URL`.

## Available scripts

| Command | Description |
| --- | --- |
| `pnpm --filter @love-parser/frontend dev` | Start Vite in development mode with React Refresh. |
| `pnpm --filter @love-parser/frontend build` | Production build + type checking via Vite. |
| `pnpm --filter @love-parser/frontend build:dev` | Build with dev mode enabled (useful for staging). |
| `pnpm --filter @love-parser/frontend preview` | Serve the latest build locally. |
| `pnpm --filter @love-parser/frontend lint` | Run ESLint (flat config) with React, Hooks, and Refresh plugins. |

## Environment variables

- `VITE_API_URL` – base URL for backend API calls (defaults to `http://localhost:3000`).
- `VITE_APP_NAME` (optional) – customize UI branding if required.

Store secrets in `.env` files; Vite injects variables prefixed with `VITE_`.

## Project structure

- `src/` – application entry point and feature modules (routes, components, hooks, utils).
- `src/lib/api.ts` (or equivalent) – centralizes API clients.
- `tailwind.config.ts` / `components.json` – design system tokens.

## Contributing

Follow the root `README.md` and backend `DEV_GUIDE.md` for workspace-wide practices. Run `pnpm lint` before submitting PRs that touch the frontend.
