# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: express-session + bcryptjs (session-based admin auth)
- **AI**: Replit AI Integrations (OpenAI/gpt-5.2) for article generation from URLs

## Project: Refúgio da Ferradura

A premium tourism website for "Rota da Ferradura" in Guarapari, Espírito Santo, Brazil.

### Features
- **Public site**: Home, Blog, Places (Cachoeiras/Trilhas/Gastronomia/Hospedagem/Praias/Mirantes), Search
- **Admin panel**: Dashboard, Posts CRUD with WYSIWYG editor, Places CRUD, Media upload
- **AI Integration**: Generate articles from URLs using OpenAI gpt-5.2

### Admin Credentials
- Username: `admin`
- Password: `admin123`

### Database Tables
- `admins` — admin users (username + password hash)
- `posts` — blog posts (title, slug, content HTML, category, status draft/published)
- `places` — places/locations (name, slug, description HTML, category, address, phone, etc.)

### API Routes (all under /api)
- `POST /auth/login` — admin login
- `POST /auth/logout` — admin logout
- `GET /auth/me` — get current admin
- `GET /posts` — list published posts (public)
- `GET /posts/admin` — list all posts (admin)
- `POST /posts/admin/create` — create post (admin)
- `GET/PATCH/DELETE /posts/admin/:id` — manage post (admin)
- `GET /posts/:slug` — get post by slug (public)
- `GET /places` — list places with optional category/search filters (public)
- `GET /places/admin` — list all places (admin)
- `POST /places/admin/create` — create place (admin)
- `GET/PATCH/DELETE /places/admin/:id` — manage place (admin)
- `GET /places/:slug` — get place by slug (public)
- `POST /media/upload` — upload image file (returns URL)
- `GET /media/files/:filename` — serve uploaded files
- `POST /ai/generate-from-url` — AI generate article from URL (admin)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── refugio-da-ferradura/  # React + Vite frontend (the main website)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── integrations-openai-ai-server/  # OpenAI AI integration
├── scripts/                # Utility scripts (single workspace package)
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Key Commands

- `pnpm --filter @workspace/api-spec run codegen` — re-generate API client/Zod from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/refugio-da-ferradura run dev` — run frontend dev server
- `pnpm --filter @workspace/api-server run dev` — run API server
