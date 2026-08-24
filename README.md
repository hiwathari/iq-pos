# IQ POS

A web-based, multi-restaurant point of sale platform.

- **Super Admin** — create and suspend restaurants, and jump into any restaurant's console to manage it.
- **Restaurant Admin** — manage the menu (categories/dishes), tables, staff accounts, and view the dashboard.
- **Staff** — run the floor: take orders on the Order Line, manage tables and reservations.

## Stack

- [Next.js](https://nextjs.org) (App Router, Server Actions) + TypeScript + Tailwind CSS
- [Drizzle ORM](https://orm.drizzle.team) on [Turso](https://turso.tech) (libSQL)
- Email/password auth with signed JWT session cookies (`jose` + `bcryptjs`), enforced in `src/proxy.ts`

## Local development

1. Copy `.env.example` to `.env.local` and fill in `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `JWT_SECRET`.
2. `npm install`
3. `npm run db:push` — pushes the schema to your Turso database.
4. `npm run db:seed` — seeds a super admin and two demo restaurants (see console output for credentials).
5. `npm run dev`

## Scripts

- `npm run dev` / `npm run build` / `npm run start`
- `npm run db:push` — sync the Drizzle schema to the database
- `npm run db:seed` — seed demo data (super admin, restaurants, admins, staff, menus, tables, orders)
