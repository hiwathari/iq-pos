# IQ POS

A web-based, multi-restaurant point of sale platform.

- **Super Admin** — create and suspend restaurants, and jump into any restaurant's console to manage it.
- **Restaurant Admin** — manage the menu (categories/dishes), tables, staff accounts, printers (scoped to their own restaurant only), and Till/Kitchen Display PINs.
- **Staff** — run the floor: take orders on the Till, manage tables and reservations.
- **Till / Kitchen Display devices** — unlock straight into the Till or Kitchen Display with a 6-digit PIN at `/till-login` or `/kitchen-login`, no email/password needed on shared hardware. PINs are issued and rotated by the restaurant admin in Settings.

## Stack

- [Next.js](https://nextjs.org) (App Router, Server Actions) + TypeScript + Tailwind CSS
- [Drizzle ORM](https://orm.drizzle.team) on [Turso](https://turso.tech) (libSQL)
- Email/password auth with signed JWT session cookies (`jose` + `bcryptjs`), enforced in `src/proxy.ts`

## Local development

1. Copy `.env.example` to `.env.local` and fill in `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `JWT_SECRET`.
2. `npm install`
3. `npm run db:push` — pushes the schema to your Turso database.
4. `npm run db:seed` — wipes all existing data and seeds one super admin plus one restaurant with an admin and staff account (see console output for credentials and PINs).
5. `npm run dev`

## Scripts

- `npm run dev` / `npm run build` / `npm run start`
- `npm run db:push` — sync the Drizzle schema to the database
- `npm run db:seed` — reset to a fresh setup (super admin, one restaurant, admin, staff) — **destructive**, wipes all existing data first
