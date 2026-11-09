# Checklist Legal: rebuild (Angular 22 + Supabase)

Corporate-compliance register for Mozambican entities, replacing the Laravel/Inertia app at checklists.fragoso.io.

- Phase 1 findings: [docs/phase1/PHASE1-SPEC.md](docs/phase1/PHASE1-SPEC.md)
- Architecture: [docs/phase2/PHASE2-ARCHITECTURE.md](docs/phase2/PHASE2-ARCHITECTURE.md)

## Prerequisites
Node 24+, Docker Desktop (running), Git.

## Run locally
```bash
npm install
npx supabase start          # Postgres, Auth, Storage, Realtime, Edge runtime, Mailpit
npx supabase db reset       # applies migrations + seed.sql
npm start                   # http://localhost:4200
```
- Supabase Studio: http://127.0.0.1:54323
- Mailpit (catches every auth/invitation e-mail locally): http://127.0.0.1:54324
- Copy the **anon / publishable key** printed by `supabase start` into `src/environments/environment.ts`.

### Local test accounts (seed only, never in production)
| E-mail | Password | Role |
|---|---|---|
| `demo@checklist.test` | `Checklist#Demo2026` | Admin of *Demo Consultores, Lda* (Profissional plan) |
| `gestor@checklist.test` | `Checklist#Demo2026` | Manager in the same organization |
| `superadmin@checklist.test` | `Checklist#Admin2026` | Platform superadmin (back office) |

## Tests
```bash
npx supabase test db        # pgTAP: tenant isolation, roles, business rules, audit immutability
npx ng build                # type-check + production build
```

## Layout
```
src/app/core        Supabase client, auth, org context, guards, i18n, error mapping
src/app/shared      UI building blocks (icons, dialogs, chips, org form, validators)
src/app/layouts     auth shell, application shell (front office + /admin back office)
src/app/features    one folder per screen (dashboard, company, entities, ficha, audit, …)
public/i18n         pt.json / en.json
supabase/migrations schema, RLS, audit log, business rules (numbered, append-only)
supabase/functions  Edge Functions (document-download, …)
supabase/tests      pgTAP test suites
```
