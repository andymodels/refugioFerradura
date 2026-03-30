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

A premium tourism website for "Rota da Ferradura" in Guarapari, Espírito Santo, Brazil. All content in Brazilian Portuguese.

### Features
- **Public site**: Home, Blog (with tag filters), Lugares (places by tag), Search, individual post/place pages
- **Admin panel**: Dashboard with stats, unified Posts CRUD (blog + places unified), Media upload
- **AI Integration**: Generate articles from URLs using OpenAI gpt-5.2
- **Unified content model**: Posts hold both editorial articles AND places data, distinguished by tags

### Admin Credentials
- Username: `admin`
- Password: `admin123`

### Database Tables
- `admins` — admin users (username + password hash)
- `posts` — unified content (blog posts + places); has: title, subtitle, slug, excerpt, content (HTML), coverImage, gallery (JSON array), videoEmbeds (JSON array), tags (JSON array), status (draft/published), metaDescription
- `places` — legacy table (no longer used; data migrated into posts with tags)

### Tag System
Posts are categorized using a JSON array `tags` column:
- `turismo` — general tourism content
- `natureza` — nature, waterfalls, beaches
- `gastronomia` — restaurants, food
- `hospedagem` — accommodation
- `lugares` — flag for place-type content shown on /lugares page
- `experiencias` — activities, trails, adventures
- `cultura`, `aventura` — additional categories

### API Routes (all under /api)
- `POST /auth/login` — admin login
- `POST /auth/logout` — admin logout
- `GET /auth/me` — get current admin
- `GET /posts` — list published posts (public); supports `?search=` and `?tag=` filters
- `GET /posts/admin` — list all posts (admin)
- `POST /posts/admin/create` — create post (admin)
- `GET/PATCH/DELETE /posts/admin/:id` — manage post (admin)
- `GET /posts/:slug` — get post by slug (public)
- `POST /media/upload` — upload image file (returns URL)
- `GET /media/files/:filename` — serve uploaded files
- `POST /ai/generate-from-url` — AI generate article from URL (admin)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (routes: posts, auth, media, ai)
│   └── refugio-da-ferradura/  # React + Vite frontend (the main website)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks (via codegen)
│   ├── api-zod/            # Generated Zod schemas from OpenAPI (via codegen)
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
- `pnpm --filter @workspace/db run push` — push DB schema changes (use direct SQL ALTER TABLE if interactive prompt blocks)
- `pnpm --filter @workspace/refugio-da-ferradura run dev` — run frontend dev server
- `pnpm --filter @workspace/api-server run dev` — run API server

## Notes

- `cn()` utility lives in `@/components/ui-elements` (NOT `@/lib/utils`)
- Logo: `${import.meta.env.BASE_URL}images/logo-refugio.png` (served from public/images/)
- Uploads served at `/api/media/files/:filename`
- gallery, tags, videoEmbeds stored as JSON text strings in DB
- Category column still exists in DB but is superseded by tags
