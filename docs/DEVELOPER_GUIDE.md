# IQ POS — Developer Guide

This is the one document a new developer should read start-to-finish before touching code.
It explains what the product is, how the codebase is organized, how the core domain concepts
fit together, and the operational quirks that aren't obvious from the code alone.

**This document is a living record.** Every change made to this project from here on must be
reflected here: update the relevant section AND add a dated entry to the
[Changelog](#14-changelog) at the bottom. Treat an undocumented change as an incomplete one.

> **Accuracy note (2026-10-09):** an earlier working session's own internal notes claimed this
> app had a "cafe vs restaurant" business-type switch that auto-marks a paid order as "Served"
> without sending it to the kitchen. That feature **does not exist anywhere in this codebase** —
> it was never actually built, despite being described elsewhere as if it had been. If you came
> here looking for it, see [§13 Known Gaps](#13-known-gaps--things-that-look-built-but-arent) —
> this doc only describes what is actually in the code, verified by reading it, not what any
> conversation or summary claimed.

---

## Table of Contents

1. [What This Product Is](#1-what-this-product-is)
2. [Tech Stack](#2-tech-stack)
3. [Repository Layout](#3-repository-layout)
4. [Multi-Tenancy & Request Flow](#4-multi-tenancy--request-flow)
5. [Auth, Sessions & Roles](#5-auth-sessions--roles)
6. [Database Schema Reference](#6-database-schema-reference)
7. [Core Domain Concepts](#7-core-domain-concepts)
8. [Payment / Card-Machine Integrations](#8-payment--card-machine-integrations)
9. [The Till: Full vs Mobile/Simple](#9-the-till-full-vs-mobilesimple)
10. [Feature Map (what lives where)](#10-feature-map-what-lives-where)
11. [Environments, Config & Deployment](#11-environments-config--deployment)
12. [Development Workflow & Gotchas](#12-development-workflow--gotchas)
13. [Known Gaps / Things That Look Built But Aren't](#13-known-gaps--things-that-look-built-but-arent)
14. [Changelog](#14-changelog)

---

## 1. What This Product Is

**IQ POS** is a multi-tenant restaurant/cafe point-of-sale SaaS: one deployment serves many
independent restaurants ("tenants"), each with their own menu, staff, tables, till, kitchen
display, and settings, fully isolated from every other tenant's data.

As of this writing it is **live in production for three tenants**: Al Zayt, Zafran, and Hello
Chai.

The product covers, end to end:
- Taking orders (dine-in, take-away, delivery, third-party, online/QR, kiosk)
- Routing tickets to a Kitchen Display by station
- Taking payment (cash, manual card terminal, or a live-charged SumUp/Teya card reader)
- End-of-day cash/card reconciliation ("End Day" / shift close)
- Reporting, loyalty cards, coupons, inventory, staff permissions
- A Super Admin layer that provisions and brands each restaurant

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Server Components, Server Actions) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| ORM | **Drizzle ORM** |
| Database | **Turso** (hosted libSQL / SQLite-compatible), via `@libsql/client` |
| Auth | Hand-rolled: `bcryptjs` password hashing + `jose` signed JWT session cookies |
| Email | `resend` (OTP / magic-link emails for loyalty sign-in) |
| Icons | `lucide-react` |
| Charts | `recharts` |
| Images | `sharp` (server-side), Next's `ImageResponse` for generated PWA icons |
| Hosting | **Vercel** |

**Next.js 16 breaking change you need to know about:** the file that used to be `middleware.ts`
in older Next.js is now **`proxy.ts`** (`src/proxy.ts` in this repo), exporting a `proxy()`
function instead of `middleware()`. If your instincts say "there's no middleware, auth must be
broken" — it isn't; look at `src/proxy.ts`. See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
for the official migration note. `AGENTS.md` in the repo root flags this generally: **this
Next.js version has several breaking changes from what you may know** — when in doubt, check
`node_modules/next/dist/docs/` before assuming training-data knowledge of Next.js still applies.

## 3. Repository Layout

```
src/
  app/                      # Next.js App Router — one folder per route
    dashboard/              # Admin landing page: sales summary, open/close till
    order-line/             # THE TILL — order-line-client.tsx (full), mobile-till-client.tsx
                             #   (simplified), till-mode-switcher.tsx (picks between them)
    kitchen/                # Kitchen Display — kitchen-client.tsx
    manage-table/           # Floor plan / table editor + QR code generation
    manage-dishes/          # Menu editor (categories, dishes, pricing)
    pricing/                # Per-channel price overrides
    coupons/                # Discount coupon management
    loyalty/                # Loyalty card admin view
    inventory/              # Stock tracking
    customers/               # (placeholder/basic customer view)
    reports/                # Sales/shift reports, Card Settlements tab
    shift-report/[id]/      # One closed shift's detail report
    settings/               # Restaurant config — see settings/*-client.tsx per section
    super-admin/            # Platform-level: create restaurants, branding, online-ordering flags
    invoice/[orderId]/      # Public, unauthenticated invoice/receipt page
    order/[slug]/           # Public customer-facing ordering (QR table order + kiosk)
    my-card/[slug]/         # Loyalty member self-service (magic-link sign-in)
    till-login/, kitchen-login/, staff-login/, login/   # PIN / password entry points
    api/webhooks/sumup/     # SumUp payment webhook receiver
    api/pwa-icon/[kind]/    # Generated PWA icons (cached — see §12)
  components/               # Shared UI: sidebar, topbar, app-shell, pin-login-form, etc.
  db/
    schema.ts               # ALL Drizzle table definitions — the single source of truth for data shape
    client.ts                # Lazy Turso/libSQL client (see §11)
  lib/
    actions/                # Server Actions ("use server") — one file per feature area.
                             #   This is where writes happen and permissions are enforced.
    data/                   # Read-only query helpers (no "use server" — never call these
                             #   directly from a Client Component, only from a Server
                             #   Component or from an actions/ file).
    auth.ts, session.ts, scope.ts, permissions.ts   # Auth/session/authorization core — read §5
    business-day.ts          # "What business day is this timestamp?" — timezone/openTime aware
    order-helpers.ts         # Order lifecycle helpers shared by actions + data layers
    sumup.ts, teya.ts        # Raw API clients for the two card-machine integrations
    types.ts                 # Shared TS types + small pure helper functions (money math, etc.)
  proxy.ts                   # Request-level auth gate + custom-domain rewrite (see §4)
scripts/
  seed.ts                    # npm run db:seed — wipes DB, creates one super admin + one restaurant
drizzle.config.ts             # drizzle-kit config (local dev only — see §11 on how migrations
                               # actually get applied in this project)
```

**Convention:** every page that needs restaurant data is a Server Component (`page.tsx`) that
fetches data and passes it as props into a Client Component (`*-client.tsx`) that holds the
interactive UI and calls Server Actions. Look for this pair in nearly every `app/` subfolder.

## 4. Multi-Tenancy & Request Flow

Every tenant-scoped database row carries a `restaurantId`. There is **no row-level database
enforcement** (no RLS) — isolation is enforced entirely in application code, by always filtering
on `restaurantId` resolved server-side from the session (see `requireRestaurantContext()` in
`src/lib/scope.ts`). **Every new query or action must filter by this `restaurantId` — never trust
one passed from the client.**

Request flow, in order:

1. **`src/proxy.ts`** runs on every request (except static assets). It:
   - Rewrites requests on a restaurant's **custom domain** to `/order/<slug>/...` transparently
     (so `order.alzayt.com/` silently serves `/order/al-zayt/`).
   - Lets customer-facing prefixes (`/my-card`, `/order`, `/invoice`) through untouched — they
     have their own, separate auth model (see §5).
   - For everything else, reads the session JWT cookie and redirects to `/login` if missing,
     or to the right home page for the session's role if they're on the wrong kind of page (a
     PIN-based `"till"` session gets forced onto `/order-line` only, etc.).
   - Does **not** check per-page staff permissions (that needs a DB round-trip and this runs at
     the edge/request layer) — that's done per-page by `requirePermission()`/`assertPermission()`.
2. The matched **Server Component page** calls `requireRestaurantContext()` (or
   `requirePermission(key)` for admin-only sections) to get `{ session, restaurantId }`, then
   calls into `lib/data/*` to fetch rows scoped to that `restaurantId`.
3. The page renders a Client Component with that data as props.
4. User interactions call **Server Actions** in `lib/actions/*`, which re-derive
   `restaurantId`/`session` themselves (never trust anything about identity from the client),
   write to the DB, and call `revalidatePath()` for the pages that need to reflect the change.

## 5. Auth, Sessions & Roles

There is no third-party auth provider. Sessions are a signed JWT (HS256, via `jose`) stored in
an `httpOnly` cookie (`iq_pos_session`), verified in both the edge (`proxy.ts`) and Node runtime
(`lib/auth.ts`) — see `src/lib/session.ts` for the shared, edge-safe sign/verify code.

**Roles** (`Role` type, `src/lib/session.ts`):

| Role | Scope | Notes |
|---|---|---|
| `super_admin` | Whole platform | Creates restaurants, sets branding, online-ordering flags. "Manages as" any restaurant via **impersonation** (a separate `iq_pos_impersonate` cookie holding the target `restaurantId` — see `getActiveRestaurantId()`). |
| `regional_admin` | A subset of restaurants | Same power as super_admin but only over restaurants listed in the `restaurant_access` table for their `userId`. Enforced by `assertRestaurantAccess()`. |
| `admin` | One restaurant | Full control of their own restaurant. |
| `accounts` | One restaurant | Auto-created alongside every restaurant's admin (see `createRestaurantAction`). Same page access as `admin`, but a **restricted view of sales figures** — see `src/lib/accounts-filter.ts`: Cash and the terminal flagged `isDefault` show in full; every other payment terminal is clipped to the trailing 14 days. |
| `staff` | One restaurant, limited pages | The only role with a configurable permission set — see `PermissionKey`/`DEFAULT_STAFF_PERMISSIONS` in `src/lib/permissions.ts`. Every other role implicitly has full access within its own scope. |
| `till` | One restaurant, `/order-line` only | Ephemeral, minted by a 6-digit PIN at `/till-login` (`lib/actions/pin-auth.ts`). Doesn't correspond to a stored `users` row's role — any staff member's `tillPin` resolves to this session type. |
| `kitchen_display` | One restaurant, `/kitchen` only | Same idea as `till`, minted via `kitchenPin` at `/kitchen-login`, or via a dedicated display's own `printers.pin` (which also sets `displayStation` so that screen opens straight on its station instead of the station-less "All" view). |

**Permission enforcement pattern** — used by (almost) every Server Action:
```ts
const { session, restaurantId } = await requireRestaurantContext(); // throws/redirects if no session
await assertPermission(session, "settings"); // no-op for every role except "staff"
```
And by every admin-only page:
```ts
const { session, restaurantId } = await requirePermission("settings"); // redirects if staff lacks it
```

**Customer-facing auth is separate and unrelated**: `/my-card` (loyalty members) and `/order`
(public ordering) use their own session cookie and OTP/magic-link flow (`lib/loyalty-session.ts`,
`lib/actions/loyalty-auth.ts`) — never the staff JWT above. `/invoice/[orderId]` has **no auth at
all**; its security model is "the order's UUID is unguessable," the same trust model as a
Stripe/PayPal receipt link.

## 6. Database Schema Reference

All tables live in **`src/db/schema.ts`** — read that file top-to-bottom for the authoritative,
commented definition of every column. Summary by table:

| Table | Purpose |
|---|---|
| `restaurants` | One row per tenant. Branding, currency, tax toggle, shop hours/timezone, online-ordering flags, till-open float, SumUp/Teya credentials. |
| `users` | Staff/admin/accounts/super_admin/regional_admin logins. `tillPin`/`kitchenPin` are **globally unique** 6-digit codes (not just per-restaurant) because PIN login looks a code up with no restaurant context first. |
| `restaurant_access` | Which restaurants a `regional_admin` can manage. |
| `categories` | Menu categories — printer routing, Kitchen Display station override, tax rate. |
| `dishes` | Menu items — price, per-channel price overrides (`channelPrices`), optional inventory link, out-of-stock flag. |
| `tables` | Floor plan — area, capacity, live status, `seatedAt` (occupied-time timer). |
| `reservations` | Booking records, independent of `orders`/`tables` live status. |
| `orders` | **The central table.** One row per ticket — items (JSON), payment lines, discounts/coupon, channel, status lifecycle, loyalty link, `placedVia` (staff/online/kiosk). See §7.1. |
| `loyalty_members` | A customer's loyalty card, keyed by phone or email + a 7-char `code`. |
| `loyalty_magic_links` | One-time sign-in tokens for loyalty members (hash-only storage). |
| `coupons` | Percent/fixed discount codes, scoped per restaurant. |
| `printers` | Physical printers **and** Kitchen Display screens (`kind` distinguishes them) — see §7.3. |
| `payment_terminals` | Named card machines. `provider` (`null`/`sumup`/`teya`) decides whether tapping it on the Till starts a live charge or is just a manual log entry. |
| `sumup_checkouts` | One row per SumUp charge attempt — see §8.1. |
| `teya_payments` | One row per Teya charge attempt — see §8.2. |
| `notifications` | Admin alerts shown via the Topbar bell (currently just "shift didn't balance"). |
| `integrations` | Third-party delivery platform credentials (Uber Eats/Deliveroo/Just Eat) — **present in schema, not wired to a real API anywhere yet** (see §13). |
| `order_counters` | Per-restaurant running counter that `nextOrderNumber()` encodes into the 5-char order code. |
| `shifts` | A closed-out End Day reconciliation — frozen sales/cash figures, not recomputed later. See §7.2. |
| `inventory_items` | Tracked stock, manually adjusted or auto-decremented on sale. |
| `petty_cash_entries` | Manual cash in/out, outside of order payments. |
| `terminal_payouts` / `terminal_expenses` | Hand-entered, per-terminal-per-day bank payout and provider-fee figures, reconciled against the Till's own recorded card sales on the "Card Settlements" Reports tab. |

**Naming convention**: every table/column is `snake_case` in SQL but camelCase in the Drizzle
schema and everywhere in TypeScript — Drizzle handles the mapping. `id()` and `timestamp()`
(top of `schema.ts`) are tiny local helpers: `id()` is a UUID primary key, `timestamp()` is a
`Date.now()`-defaulted epoch-ms integer.

## 7. Core Domain Concepts

### 7.1 Order lifecycle

`orders.status` ∈ `"In Kitchen" | "Wait List" | "Ready" | "Served" | "Voided"`.

- A new order is **always** inserted as `"In Kitchen"`, unless its channel is `"Wait List"` (then
  it's `"Wait List"`). **Nothing in this codebase skips straight to `"Served"` on creation,
  regardless of payment status** — see the important correction at the top of this document and
  §13.
- `placeOrderAction` (`lib/actions/orders.ts`) is the one function that creates/edits orders. Key
  behaviors worth knowing before you touch it:
  - **De-dupes** a double/triple-tapped "Place Order" within 8 seconds (same staff member, same
    table/channel/items) to guard against duplicate tickets from a slow network.
  - **Never trusts a client-supplied discount.** Discount eligibility (`canDiscount`, from the
    `till-discount` permission) and the coupon amount are both recomputed server-side from the
    live coupon row and this order's own subtotal.
  - Editing an order that was already `"Ready"` and adding an unprepped item **reopens** it to
    `"In Kitchen"` so it reappears on the Kitchen Display.
- **"Closed out"** = `status === "Served" && paymentMethod != null` — this exact predicate is
  duplicated in three places that must agree: `isClosedOut()` (`lib/actions/orders.ts`),
  `isOrderLive()` (`lib/order-helpers.ts`, the inverse), and `isOrderClosedOut()` (duplicated in
  both `order-line-client.tsx` and `mobile-till-client.tsx` for client-side UI decisions). A
  closed-out order's table auto-frees about a minute after `closedOutAt` is set.
- **Auto-void sweep**: there's no background job runner in this app. Instead,
  `autoVoidStaleOrders()` (`lib/data/orders.ts`) runs lazily on every `listOrders()` call — any
  order still `"Wait List"`/`"In Kitchen"` from before the current **business day** (see §7.4)
  started gets voided with reason `AUTO_VOID_REASON`, and its table freed. The Dashboard's
  "orders carried over" banner is just this reason string showing up, dismissible per-restaurant
  via `autoVoidNoticeDismissedAt`.
- `payments: PaymentLine[]` holds a > 1-method breakdown ("Split" in `paymentMethod`); the common
  single-method case only sets `paymentMethod`, leaving `payments` null.

### 7.2 Shifts / End Day

An admin/manager taps "Open Till" (`openTillAction`) at the start of a day, declaring a starting
cash float (`restaurants.pendingOpeningBalance`), and "End Shift" (`endShiftAction`) at the end.
Closing:
- Freezes every sales figure (`totalSales`, `cashSales`, `cardSales`, per-terminal
  `terminalSales`) as of that moment into a new `shifts` row — later new orders never retroactively
  change a closed shift's numbers.
- Compares `expectedCash` (`openingBalance + cashSales − cashExpenses − envelopeCash`) against
  what the manager actually counted (`cashCounted`), and does the same per-terminal via
  `terminalSales` vs `terminalCounts`.
- Clears `pendingOpeningBalance` back to null (next day must declare its own) and adds any
  `envelopeCash` taken out this shift to the restaurant's running `envelopeCashBalance`.
- If the drawer doesn't balance, notifies the admin (see `notifications` table / Topbar bell).

### 7.3 Printers vs Kitchen Displays

`printers.kind` ∈ `"printer" | "display" | "both"` — one table models both physical ticket
printers and Kitchen Display screens, because a "station" (Kitchen/Bar/Receipt/Expo) is the same
concept for either. A `"display"` row's `pin` field is a dedicated 6-digit code that logs that
specific screen straight into its own station (not the station-less "All" view a generic staff
kitchen PIN lands on).

A category's `kitchenDisplayStation` can override which station its items show on, independent of
which printer it's routed to — `null` means "derive it automatically from the printer", `"None"`
hides it from every Kitchen Display entirely.

### 7.4 Business day / timezone

Because a shift can run past midnight, "today" for day-boundary logic (auto-void sweep, Kitchen
Display's Completed panel, Reports' daily buckets) is **not** plain UTC midnight — it's anchored
to `restaurants.openTime` (a `"HH:MM"` in `restaurants.timezone`, an IANA name). All of this math
lives in `src/lib/business-day.ts` (`businessDayStart`, `businessDateKey`, `businessDayRange`) and
correctly accounts for DST by asking the platform's real timezone database rather than assuming a
fixed UTC offset. A restaurant that's never set shop hours (`openTime === null`) gets exactly the
old plain-UTC-midnight behavior — this was retrofitted, so it had to stay backward compatible.

### 7.5 Online ordering / QR / Kiosk

Super-Admin-gated (`restaurants.onlineOrderingEnabled`, plus independent sub-flags
`qrTableOrderingEnabled`/`kioskOrderingEnabled`). Public, unauthenticated entry at `/order/[slug]`
(or the tenant's own `customDomain`, rewritten transparently by `proxy.ts`). Orders placed this
way go through `placePublicOrderAction` (`lib/actions/public-order.ts`) — a separate action from
the staff-facing `placeOrderAction`, with its own server-side trust checks, and are tagged
`placedVia: "online" | "kiosk"` so Kitchen/Till can flag them distinctly.

### 7.6 Loyalty

A loyalty card (`loyalty_members`) is keyed by phone or email, with a 7-character `code` (first 2
letters of the restaurant + 5 random alphanumerics — `src/lib/loyalty-code.ts`) printable/QRable.
Sign-in to `/my-card` is a magic-link/6-digit-code email flow (`loyalty_magic_links`, hash-only
storage, sent via Resend) — see `lib/actions/loyalty-auth.ts`.

## 8. Payment / Card-Machine Integrations

A `payment_terminals` row with `provider: null` is "manual" — staff run the physical machine
out-of-band and just tap the terminal's name on the Till to log the amount, unchanged since this
app's first version. `provider: "sumup"` or `"teya"` makes tapping that terminal start a **live,
API-driven charge** instead.

### 8.1 SumUp (`lib/sumup.ts`, `lib/data/sumup.ts`, `lib/actions/sumup.ts`)

- Each restaurant connects its **own** SumUp merchant account (`restaurants.sumupApiKey` +
  `sumupMerchantCode`, set in Settings → Payment Terminals).
- A terminal is **paired** to a specific SumUp Solo reader (`pairSumupReaderAction` →
  `paymentTerminals.sumupReaderId`/`sumupReaderStatus`).
- Charging: `startSumupChargeAction` creates a SumUp Cloud API checkout (`checkout_id` +
  `client_transaction_id`), recorded immediately in `sumup_checkouts` with `status: "pending"`.
  The Till then polls (`pollSumupChargeAction`, every ~2s) or waits for the webhook
  (`app/api/webhooks/sumup/route.ts`).
- **The webhook payload's status is never trusted directly** — `refreshSumupCheckoutStatus()`
  (`lib/data/sumup.ts`) always re-fetches the checkout from SumUp's own API before updating the
  row, per SumUp's own documented guidance never to trust a webhook body as-is.
- UI: `SumupChargeOverlay` in `order-line-client.tsx` — a "waiting for card" modal with
  start/poll/cancel, shown only on the full desktop Till (see §9 for why).

### 8.2 Teya (`lib/teya.ts`, `lib/data/teya.ts`, `lib/actions/teya.ts`)

Same shape as SumUp, adapted to Teya's POSLink API:
- Restaurant-level OAuth2 client-credentials app (`teyaClientId`/`teyaClientSecret`/`teyaStoreId`).
- A terminal just needs Teya's pre-existing `teyaTerminalId` pasted in (no pairing-code flow —
  Teya terminals are pre-registered devices the restaurant already has an id for).
- `createTeyaPayment` → `teya_payments` row, status `NEW → IN_PROGRESS → SUCCESSFUL|FAILED|CANCELLED`
  from Teya's own enum, mapped in `mapTeyaStatus()`.
- **Polling only** — Teya has no confirmed webhook/signature model in its public docs (it does
  document an SSE "subscribe" stream, deliberately not used for this first version — see the
  comment in `lib/teya.ts` for the reasoning if you're considering adding it).

### 8.3 Card Settlements (reconciliation)

A Reports tab, not a payment integration: `terminal_payouts` + `terminal_expenses`
(`lib/actions/terminal-settlements.ts`) let staff hand-enter what a card provider's own statement
says it actually paid into the bank and deducted in fees, per terminal per day — compared against
what the Till itself recorded (orders' `payments`, and `shifts.terminalCounts`). None of SumUp,
Teya, or a "manual" terminal expose payout data over an API, so this stays a manual-entry
reconciliation tool regardless of provider.

## 9. The Till: Full vs Mobile/Simple

`till-mode-switcher.tsx` auto-picks between two **completely separate** implementations based on
`window.innerWidth < 700` (overridable via `localStorage["till-mode-override"]`):

- **`order-line-client.tsx`** ("Full") — the complete Till: tables, splitting payments across
  multiple methods, discounts/coupons, loyalty lookup, SumUp/Teya live card charging, editing a
  sent order, the payment-lock/redo flow (see §14 changelog).
- **`mobile-till-client.tsx`** ("Simple") — a deliberately minimal quick-order flow for a
  handheld/phone screen: channel → table → menu → cart → send. It has **no** live card-charging
  overlay. As of the most recent change (§14) it can record a **Cash** payment at order time (a
  "Pay Later"/"Cash" toggle), but card payments are intentionally not offered here — marking an
  order "paid via SumUp/Teya" without the real charge-and-poll flow this screen has no room for
  would create false "paid" records with no money actually taken. Use the Full Till for card
  payments.

Both clients duplicate a handful of small helpers (`isOrderClosedOut`, the `SimpleCart`/`Cart`
payment shape) rather than sharing one — this was a deliberate choice to keep "Simple" simple;
don't assume a change to one automatically applies to the other.

## 10. Feature Map (what lives where)

| Feature | Page(s) | Action(s) | Data |
|---|---|---|---|
| Till / orders | `app/order-line/` | `lib/actions/orders.ts` | `lib/data/orders.ts` |
| Kitchen Display | `app/kitchen/` | (status updates via `orders.ts` actions) | — |
| Tables / floor plan | `app/manage-table/` | `lib/actions/tables.ts` | `lib/data/tables.ts` |
| Menu | `app/manage-dishes/` | `lib/actions/menu.ts` | `lib/data/menu.ts` |
| Channel pricing | `app/pricing/` | `lib/actions/menu.ts` | — |
| Coupons | `app/coupons/` | `lib/actions/coupons.ts` | `lib/data/coupons.ts` |
| Loyalty (admin) | `app/loyalty/` | `lib/actions/loyalty.ts` | `lib/data/loyalty.ts` |
| Loyalty (customer) | `app/my-card/` | `lib/actions/loyalty-auth.ts` | `lib/loyalty-session.ts` |
| Public ordering | `app/order/[slug]/` | `lib/actions/public-order.ts` | — |
| Inventory | `app/inventory/` | `lib/actions/inventory.ts` | `lib/data/inventory.ts` |
| Staff & permissions | `app/settings/staff-client.tsx` | `lib/actions/staff.ts` | `lib/data/staff.ts` |
| Printers / Kitchen Displays | `app/settings/printers-client.tsx` | `lib/actions/printers.ts` | `lib/data/printers.ts` |
| Payment terminals (incl. SumUp/Teya) | `app/settings/payment-terminals-client.tsx` | `lib/actions/sumup.ts`, `teya.ts` | `lib/data/sumup.ts`, `teya.ts` |
| Restaurant settings | `app/settings/restaurant-client.tsx` | `lib/actions/restaurants.ts` | — |
| Integrations (delivery platforms) | `app/settings/integrations-client.tsx` | — | — *(see §13 — not wired to a real API)* |
| Shifts / End Day | `app/dashboard/` | `lib/actions/shifts.ts` | `lib/data/shifts.ts` |
| Petty cash | — | `lib/actions/petty-cash.ts` | `lib/data/petty-cash.ts` |
| Reports (incl. Card Settlements) | `app/reports/` | `lib/actions/terminal-settlements.ts` | `lib/data/reports.ts`, `terminal-settlements.ts` |
| Super Admin (create/brand restaurants) | `app/super-admin/` | `lib/actions/restaurants.ts` | — |
| Regional admins | `app/super-admin/` | `lib/actions/regional-admins.ts` | — |
| Auth (staff/admin) | `app/login/`, `till-login/`, `kitchen-login/`, `staff-login/` | `lib/actions/auth.ts`, `pin-auth.ts` | — |
| Invoice / receipt | `app/invoice/[orderId]/` | — | `lib/data/orders.ts` |
| Notifications | Topbar bell (`components/topbar.tsx`) | `lib/actions/notifications.ts` | `lib/data/notifications.ts` |

## 11. Environments, Config & Deployment

**Environment variables** (all read via `process.env`, grep-verified — this is the complete set
actually used in code):

| Variable | Used for |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Database connection (`src/db/client.ts`) |
| `JWT_SECRET` | Signing staff/admin session JWTs (`src/lib/session.ts`) |
| `NEXT_PUBLIC_APP_URL` | Lets `proxy.ts` recognize the platform's own domain vs a tenant's custom domain |
| `RESEND_API_KEY`, `RESEND_SENDING_DOMAIN` | Sending loyalty OTP/magic-link emails (`src/lib/email.ts`) |
| `SUMUP_AFFILIATE_APP_ID`, `SUMUP_AFFILIATE_KEY` | Platform-level SumUp affiliate credentials (separate from each restaurant's own `sumupApiKey`) |

Local dev: copy `.env.example` → `.env.local`, fill in at least the Turso + JWT values, then
`npm install && npm run db:push && npm run db:seed && npm run dev`. `db:seed` is **destructive** —
it wipes all data first.

**Deployment**: Vercel, framework-detected as Next.js (`vercel.json` is just `{"framework":
"nextjs"}` — no custom build config). Pushing to the repo's `main` branch deploys to production.

**⚠️ How schema migrations actually get applied in this project — read this before changing
`schema.ts`:**

`package.json` has `"db:push": "drizzle-kit push"`, which is the normal Drizzle workflow for a
developer with direct database credentials. In practice, whoever is developing this app often
does **not** have a direct, interactive connection to the production Turso database (e.g. an
AI coding session with no DB credentials configured). The pattern that's been used instead:

1. Write the schema change in `src/db/schema.ts` as normal.
2. Hand-write the exact `ALTER TABLE`/`CREATE TABLE`/`CREATE UNIQUE INDEX` SQL statements that
   `drizzle-kit push` would have generated.
3. Give that SQL to whoever **does** have a Turso console/CLI session, to run directly.
4. **Only once they confirm it ran successfully** does the corresponding code get pushed to
   `main` — see the critical ordering rule in §12.

If you have real `drizzle-kit push` access in your environment, you can of course use it directly
and skip the hand-SQL step — just make sure the code reaching `main` and the schema actually
applied to the production database are never out of sync (see §12).

## 12. Development Workflow & Gotchas

### 12.1 Migration-ordering safety rule

If a schema change **adds columns to an existing, heavily-queried table** — `restaurants` and
`payment_terminals` are the two worth naming explicitly, since they're read on nearly every
authenticated page load via a plain `db.select().from(table)` (Drizzle generates an explicit
column list from the schema file, not `SELECT *`) — **the corresponding code must not reach
production before the migration has actually been run** against the live database. Otherwise
every page breaks instantly with a "no such column" SQL error, not just the new feature.

This does **not** apply to a migration that only **adds a brand-new table** (e.g. `sumup_checkouts`,
`terminal_payouts`) — nothing queries a table that doesn't exist yet until the new, gated feature
path actually runs, so that code is safe to ship first and migrate after, or in either order.

### 12.2 Keep a stale branch from biting you

If you're working from a long-lived feature/dev branch rather than directly off `main`, check
first whether it's actually caught up: this project's history includes real cases where a
long-lived branch had drifted — missing columns, missing whole features — because changes had
been shipped to `main` from short-lived branches that were never merged back. Before building on
any branch that isn't `main` itself, diff it against `origin/main`'s relevant files, or just
start fresh: `git fetch origin main && git checkout -b <your-branch> origin/main`.

### 12.3 Before shipping, verify clean:

```
npx tsc --noEmit
npx eslint <changed files>
npx next build
```
Pre-existing `<img>`-element ESLint warnings (a few files use a raw `<img>` instead of
`next/image`, by earlier choice) are expected and not a regression to fix incidentally.

### 12.4 Polling / performance

Any UI that polls (`setInterval(() => router.refresh(), ...)`) should use
**`src/lib/use-visible-interval.ts`** instead of a raw `setInterval` — it pauses while
`document.hidden` and fires once immediately on becoming visible again. A backgrounded browser
tab polling every few seconds is a real, metered cost on Vercel; this has already caused a cost
incident once (Kitchen Display + Till were both fixed to use this hook, and poll every 15s/20s
rather than 5s/8s). Any new auto-refreshing screen should follow the same pattern from day one.

### 12.5 Writing a new card-machine integration

Follow the SumUp/Teya shape exactly (§8.1/8.2) — it's now an established pattern:
1. Schema: restaurant-level credentials + per-terminal provider-specific id field(s) on
   `payment_terminals` + a dedicated `<provider>_payments`/`<provider>_checkouts` table with a
   unique index on the provider's own charge id.
2. `lib/<provider>.ts` — raw API client, its own `Error` subclass.
3. `lib/data/<provider>.ts` — DB lookups + a `refresh<Provider>Status` function that's the
   **only** place a webhook (if any) or a poll is allowed to update status, and it must always
   re-verify against the provider's own API rather than trust a webhook payload.
4. `lib/actions/<provider>.ts` — credential-saving, pairing/connecting, start/poll/cancel charge.
5. Settings UI: an account-credentials form + a per-terminal connect/pair modal in
   `payment-terminals-client.tsx`.
6. Till UI: a dispatcher in the charge-button handler + a `<Provider>ChargeOverlay` component
   (start → poll every ~2s → cancel), **on the Full Till only** (`order-line-client.tsx`) — the
   Mobile Till has no room for a live wait-for-card flow (§9).

## 13. Known Gaps / Things That Look Built But Aren't

Keep this section honest and current — it exists specifically so nobody re-discovers these the
hard way, and so nobody assumes something is wired up just because a comment or an old
conversation says so.

- **No "cafe vs restaurant" business-type setting, and no serve-on-payment shortcut.** Every new
  order is inserted as `"In Kitchen"` (or `"Wait List"`) regardless of payment status — see
  `placeOrderAction` in `lib/actions/orders.ts`. There is no `businessType` field on `restaurants`,
  no "Direct Serve" toggle in Settings, and no code path anywhere that skips an order straight to
  `"Served"` based on it being pre-paid. If a restaurant genuinely needs "pay-at-counter, skip the
  kitchen queue entirely" behavior, that's a real feature request to design and build, not a
  config flag to flip — there is nothing to flip.
- **`integrations` table (Uber Eats/Deliveroo/Just Eat) is schema-only.** The table exists with
  `enabled`/`storeId`/`apiKey` columns and a Settings tab to edit them, but there is no code
  anywhere that actually calls any of these providers' APIs. `orders.channel` does support
  `"Third Party"` with a `thirdPartyProvider` enum for manually logging such an order, but that's
  independent of the `integrations` table and involves no live API integration.
- **Apple Wallet / Google Wallet loyalty passes** — not built (tracked as a future item, not
  started).
- **Admin-managed loyalty offers** (e.g. "spend £50, get a free item") — not built; loyalty today
  is enrollment + lookup only, no rewards logic.

## 14. Changelog

> **Instruction for every future change:** add a dated entry here (newest on top), *and* update
> whichever numbered section above actually describes the thing you changed. A change without
> both halves is not done.

### 2026-10-09 — Developer Guide created; mobile Till now records Cash payment; payment-recall lock
- **Added this document.**
- `order-line-client.tsx`: recalling an already closed-out (served + paid) order now shows a
  read-only "Payment Taken" summary instead of the live payment-method buttons, with an explicit
  "Redo Payment" button to unlock it back to editable. Prevents accidentally re-tapping/altering a
  settled payment on recall.
- `mobile-till-client.tsx`: added a "Pay Later" / "Cash" toggle so an order placed from the
  simplified mobile Till can record a Cash payment at order time (previously this screen always
  sent `payments: []`, so a mobile-placed order could never show as paid until reopened on the
  Full Till). Card payments are deliberately **not** offered on this screen — see §9/§13.
- Corrected a comment (and this doc corrects the record) claiming the above hooked into a
  "cafe-type auto-serve shortcut" in `placeOrderAction` — no such shortcut exists; see §13.

### Earlier history (reconstructed from the codebase + shipped commits, not necessarily in exact
chronological order — treat this block as a one-time backfill, not a precedent for how future
entries should look):
- Multi-tenant core: restaurants, users/roles, categories/dishes, tables, orders, printers —
  initial platform.
- Restaurant branding (logo/brand color) manageable from Super Admin.
- Till UI overhaul; discount/coupon system; `till-discount` permission gate.
- Loyalty card core + magic-link/OTP email sign-in (Resend).
- Inventory/stock MVP with per-dish consumption on sale.
- Online ordering: schema flags, public signup/sign-in, `/order/[slug]` customer page,
  `/order/[slug]/kiosk`, table QR codes, custom-domain rewrite in `proxy.ts`, `placedVia` badges
  on Kitchen/Till.
- Public invoice page + QR share.
- Shop opening/closing day-cycle (`openTime`/`closeTime`/`timezone`, `business-day.ts`).
- Denomination cash-count component; End Day preview + item/issue report; unified staff PIN
  across Till/Kitchen/Dashboard login; payment-discrepancy admin notification.
- `accounts` role: restricted bookkeeping login, auto-created per restaurant.
- Card Settlements: `terminal_payouts`/`terminal_expenses` tables + Reports tab, reconciling
  hand-entered provider statements against the Till's own recorded card sales.
- **SumUp Solo integration** (§8.1): schema, API client, data/actions layers, webhook, Settings
  UI, Till charge-on-tap UI.
- **Teya POSLink integration** (§8.2): same shape as SumUp, polling-only (no webhook model used).
  (myPOS was evaluated as an alternative/addition first — real OpenAPI spec found, but a
  two-tier Partner+Merchant OAuth chain gated behind Partner Portal registration made it a bigger
  lift; Teya was built instead. Not ruled out for later.)
- Vercel cost/performance fixes: `use-visible-interval.ts` hook (pause polling in hidden tabs);
  Kitchen Display refresh 5s→15s, Till 8s→20s; `prefetch={false}` on sidebar links; cache headers
  on the generated PWA icon route.
