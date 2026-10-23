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
public/downloads/            # Served as-is at pos.luvder.com/downloads/: the Till APK, the print
                             # bridge (iq-print-bridge.js) and its installers (.sh / .ps1) — §7.8
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
   - Serves the **IQ marketing site** on `iq.luvder.com` (and `iq.localhost`): rewrites `/x` to
     `/site/x`, except `/api`, `/faq` and `/site` itself. That check runs before the custom-domain
     lookup, so the IQ host never needs a `restaurants.customDomain` row.
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

**Staff acceptance.** Every customer-placed order (website, table QR, kiosk) is inserted with
`status: "Pending"` and does *not* reach the Kitchen Display (it only shows Wait List / In
Kitchen) or Open Tickets until someone on the Till accepts it: the red **Online** tab (count,
pulsing) next to Tickets opens the list with Accept / Reject. `acceptOnlineOrderAction` moves it
to "In Kitchen" and takes inventory then (not at placement); `rejectOnlineOrderAction` voids it
("Online order not accepted") and frees the table. Both are conditional on the order still being
Pending, so two tills can't double-handle one. The Till plays `playIncomingOrderAlert` on arrival
and every 15s while any are waiting (it polls every 10s). Unaccepted orders are swept by the
day-rollover auto-void like other open ones. "Pending" is a TS-level enum value only — SQLite has
no CHECK constraint on `orders.status`, so no migration was needed.

**Table QR codes (no sign-in).** Each table's QR encodes `/order/<slug>/table/<tableId>.<sig>`,
where `sig` is an HMAC-SHA256 over `table-qr:v1:<restaurantId>:<tableId>` keyed by `JWT_SECRET`
(`lib/table-qr-token.ts`, server-only; 22 base64url chars). The table is fixed by the code:
editing the id, the restaurant slug or the signature all resolve to "This QR code isn't valid".
The page (`app/order/[slug]/table/[token]`) opens the menu straight away — no email code — and
checkout asks only for name + email *or* phone (`placeTableQrOrderAction`). Server-side it trusts
only the token for the table/restaurant, re-prices from the live menu (shared
`buildItemsFromLiveMenu` / `insertPublicOrder` with `placePublicOrderAction`), links an
*existing* loyalty member with that contact (never creates one), and caps each table at 6 QR
orders per 15 minutes against a photographed code being abused off-premises. The contact is
stored in `orders.customerPhone` (there's no email column). Orders show as `createdByName:
"Table QR"`. Staff get the codes in **Manage Tables**: a QR button on every table tile (card
preview, Download PNG, Print, Copy link) and **Table QR Codes** for all tables (per-table
download + "Print / Save all as PDF"). Cards are drawn client-side (`tableQrCardDataUrl` in
`lib/table-qr.ts`) with restaurant name, "TABLE n" in the brand colour and the QR; the signed
paths are computed server-side in `manage-table/page.tsx`. Codes don't change unless
`JWT_SECRET` does (rotating it invalidates every printed code). The older `/order/<slug>?table=n`
link still works but goes through the email sign-in flow.

### 7.6 Loyalty

A loyalty card (`loyalty_members`) is keyed by phone or email, with a 7-character `code` (first 2
letters of the restaurant + 5 random alphanumerics — `src/lib/loyalty-code.ts`) printable/QRable.
Sign-in to `/my-card` is a magic-link/6-digit-code email flow (`loyalty_magic_links`, hash-only
storage, sent via Resend) — see `lib/actions/loyalty-auth.ts`.

### 7.7 Printing: browser print vs Sunmi Cloud Print

This app has **two completely separate printing paths**, and most printers only ever use the
first one:

1. **Browser print (the default, for every printer).** `lib/print-ticket.ts` opens a small popup
   with a formatted HTML receipt and calls `window.print()` — it prints to whatever printer the
   *operating system* already has set up (paired via Bluetooth, installed as a network printer,
   etc.). This app never talks to the printer's hardware/network protocol directly for this path;
   `printers.connection`/`address` are just descriptive metadata shown in Settings, not something
   any code connects to.
2. **Sunmi Cloud Print (opt-in, per printer).** `printers.sunmiSn` being set is what switches a
   specific printer entry onto this path instead. Unlike every other integration in this app,
   Sunmi's relay is **pull, not push** — a 4-step round trip:
   - We call Sunmi's API (`lib/sunmi-print.ts` → `notifySunmiNewOrder`, `POST
     https://openapi.sunmi.com/v1/printer/newOrderNotice`) to say "printer `msn` has a new job,"
     after writing that job's content to the `sunmi_print_jobs` table
     (`lib/data/sunmi-print.ts`).
   - Sunmi's cloud pushes a wake-up to the physical printer.
   - **The printer itself** then calls back into *our own* API —
     `src/app/api/sunmi/printTicket/{getPrintTicketOrderId,getPrintTicketInfo,updatePrintTicketStatus}/route.ts`
     — to fetch the pending job id(s), then the actual content, then report back success/failure.
   - The content handed back is **raw ESC/POS command bytes, hex-encoded** (built by
     `lib/escpos-ticket.ts`) — a different representation entirely from the HTML
     `lib/print-ticket.ts` generates for browser printing.
   - Every one of our callback routes verifies the incoming request's `sign` param
     (`verifySunmiSignature`) using the same MD5 scheme Sunmi documents for our outgoing calls,
     and fails closed (denies) if `SUNMI_CLOUD_PRINT_APP_KEY` isn't configured.

Platform-level credentials (`SUNMI_CLOUD_PRINT_APP_ID`/`SUNMI_CLOUD_PRINT_APP_KEY`) are issued
once — shared across every restaurant — after registering as a partner at
`https://partner.sunmi.com/` and getting the Cloud Print channel enabled; this is **not** a
per-restaurant credential an admin enters in Settings, unlike SumUp/Teya. `shop_id` in Sunmi's API
is just each restaurant's own `id` — nothing to look up or configure separately.

**Current status: not in use.** Sunmi's Cloud Print partner channel requires an enablement step on
Sunmi's side that wasn't self-serve for this account, so no `app_id`/`app_key` were ever issued —
see §13. **Local network printing (below) is what's actually used instead.**

### 7.8 Printing, in practice: local network print via a bridge program

A third path, built after Sunmi's cloud channel turned out to be a dead end — and the one
actually in use. It needs no vendor account at all, only confirms one fact: most thermal/receipt
printers (the Sunmi NT311 included, confirmed by testing) accept a direct, unauthenticated raw
ESC/POS connection on **TCP port 9100** — the decades-old "JetDirect" standard — to anything on
the same local network, completely independent of any cloud service.

The catch: a **browser cannot open a raw TCP socket**, so the Till's own page can't talk to
`printer-ip:9100` directly. The fix is `public/downloads/iq-print-bridge.js` — a tiny, dependency-free
standalone Node program (built from `src/lib/escpos-ticket.ts`'s same ESC/POS output) that:

1. Runs on **any device on the same local network as the printer** — the simplest and recommended
   setup is directly on the Till itself via **Termux** (a terminal/Node runtime app for Android;
   `pkg install nodejs` then `node iq-print-bridge.js`), since the Till is usually already a
   Sunmi Android device sitting on that same WiFi.
2. Listens on `http://127.0.0.1:9200` for a plain HTTP POST from the Till's own browser (a
   same-device/loopback call, not a vendor API call).
3. Opens a raw TCP socket to the printer's local IP on port 9100 (or whatever's configured) and
   writes the hex-decoded ESC/POS bytes straight through.

End-to-end flow when staff tap Print on the Till (`order-line-client.tsx`'s `handlePrint`/
`printReceiptLocally`): `lib/actions/local-print.ts` (`buildTicketEscPosAction`, a thin
server-action wrapper around `buildEscPosTicket`) → `lib/local-print-bridge.ts`
(`printViaLocalBridge`) → the bridge → the printer. Which printer (if any) the Till targets is
resolved in `order-line/page.tsx` from `printers.tillReceiptPrinter` — an **explicit toggle**
("Use for Till auto-print" in Settings), deliberately **not** the same thing as `printers.isDefault`
(which routes new menu categories, unrelated to Till printing — an earlier version of this wired
the two together, which left the local print path silently unused for any restaurant whose local
printer wasn't also flagged Default; see the 2026-10-13 changelog entry). While that toggle is off
— the state of every printer until an admin turns it on — the Till keeps using the original
browser-print popup (`lib/print-ticket.ts`) exactly as before, even if a `localPrinterIp` is
already saved. Once it's on for one printer, that popup is replaced entirely for that restaurant;
there's no "alongside" fallback if the bridge turns out to be unreachable at print time.

Settings → Printers has a "Connect Local Network Print" control per (non-display) printer — IP +
optional port (defaults to 9100), plus a **Test Print** button that exercises the whole chain. A
Network/WiFi printer added with an IP (or `ip:port`) in the Add dialog gets it saved as
`localPrinterIp` straight away (`createPrinterAction`).

**Setup kit and scripts** (`components/printer-setup-guide.tsx`, shown on Super Admin → Printers
and in a collapsible under Settings → Printers): the steps, copyable one-line installers, the
finder/test commands, a "Check this device" button (detects the Till app's
`window.AndroidPrintBridge`, else GETs `http://127.0.0.1:9200/`) and the downloads. The files are
static, served from `pos.luvder.com/downloads/` (`/downloads` is a public prefix in `proxy.ts`):
- `iq-print-bridge.js` (v2) — `node iq-print-bridge.js [port]` runs the bridge, now bound to
  `127.0.0.1` only; `find [192.168.1]` scans the /24 network(s) for anything with port 9100 open;
  `test <ip> [port]` prints a test page directly (no app involved); `--version`. `GET /` returns
  `{ ok, service, version }`.
- `install-print-bridge.sh` — Termux / macOS / Linux: `curl -fsSL
  https://pos.luvder.com/downloads/install-print-bridge.sh | sh`. Installs Node on Termux
  (`pkg`), downloads the bridge to `~/iq-print-bridge`, sets up autostart (Termux:Boot script in
  `~/.termux/boot`, a launchd agent `com.iqpos.printbridge` on macOS, a systemd user service
  `iq-print-bridge` on Linux, else `nohup`), starts it and checks `http://127.0.0.1:9200`.
  `IQ_BRIDGE_PORT` / `IQ_BRIDGE_BASE` override the port / download origin (the latter for testing).
- `install-print-bridge.ps1` — Windows: `irm https://pos.luvder.com/downloads/install-print-bridge.ps1
  | iex`. Installs Node LTS via winget if missing, downloads to `%USERPROFILE%\iq-print-bridge`,
  adds a hidden-window VBScript launcher to the Startup folder, starts it and checks it.
Re-running any installer updates/repairs (it stops the running copy first).

**Super Admin → Printers** (`app/super-admin/printers`): super admins and regional admins pick a
restaurant (regional admins see only their assigned ones) and manage its printers with the same
`PrintersClient`, passed `restaurantId`. Every printer action in `lib/actions/printers.ts` takes
an optional `targetRestaurantId`; `printerScope()` accepts it only from a super_admin, or a
regional_admin for whom `assertRestaurantAccess` passes — otherwise actions use the signed-in
restaurant and the "settings" permission as before. `buildTicketEscPosAction` (test print) also
accepts a super/regional session with no restaurant. The Sunmi Cloud Print row is hidden there
(unused, and its actions need the restaurant's own session).

⚠️ **Private Network Access**: Chrome requires the bridge's preflight OPTIONS response to include
`Access-Control-Allow-Private-Network: true` before it'll let an HTTPS page (the Till, served from
the production domain) call an `http://127.0.0.1` endpoint at all — without it, the browser fails
the request silently ("Failed to fetch", nothing useful in the bridge's own logs, since the
preflight succeeds and only the *real* request gets blocked client-side). `local-print-bridge.js`
sends this header on every response; if a Test Print still fails after confirming the bridge is
running, check the browser console for a Private-Network/CORS warning before assuming anything
else is broken.

⚠️ **Test Print only ever works from the Till device itself** — the bridge call targets
`127.0.0.1` (loopback) by design, so it only succeeds on whatever device is actually running
`iq-print-bridge.js`. Testing from a different computer (e.g. opening Settings on a laptop)
will always fail with no bridge listening on *that* machine's `127.0.0.1` — that's expected, not a
bug, and isn't evidence the bridge or printer setup is wrong.

**Receipt content and when it prints** (`lib/escpos-ticket.ts`, `order-line-client.tsx`'s
`printReceiptLocally`/`handlePrint`/`handlePlaceOrder`):
- Formatted for **80mm paper, 48 columns** — `LINE_WIDTH` in `lib/escpos-ticket.ts`; change it if a
  specific printer's default font renders a different width.
- Header: restaurant logo (rendered as an ESC/POS raster image via `sharp` — ⚠️ unverified against
  a real printer, falls back to the restaurant name in large text if the logo can't be
  fetched/decoded), address, phone/email/website on one line, then a divider, order number
  (bold), date, time, channel (+ table/guest count when seated), **server name** (the session's
  own name — see `staffName`), items **grouped by menu category** (via `groupItemsByCategory`,
  which maps each cart item's `dishId` to its live category — not snapshotted at order time, so a
  dish moved to a different category later reprints under its *current* category), Delivery/Take
  Away customer details at the bottom (not inline with items), subtotal/discount/coupon/tax, a
  **bold** "TOTAL PAYABLE" line, any payment lines, the footer text, and — when the order has
  actually been saved (an id exists) — a native ESC/POS QR code (⚠️ also unverified) linking to
  `/invoice/[id]` with a "Link valid for 1 week" note (the invoice page itself has no real
  7-day expiry enforced anywhere; this is a courtesy note on the receipt, not an access control).
  There is deliberately **no "packing charge" line** — that's not a real concept anywhere in this
  app today (no field, no Till UI to set one per order); it was asked for but would need to be
  built as an actual feature first rather than faked on the printout.
- **Web print (`lib/print-ticket.ts`) is scoped out, not deleted.** Once a restaurant has
  `localPrintTarget` configured, the manual Print button and auto-print both go through
  `printReceiptLocally` only — the old browser print popup no longer appears for that restaurant.
  A restaurant with **no** local printer configured still gets the original browser-print
  behavior unchanged, so this doesn't break printing for every other tenant that hasn't set this
  up.
- **Auto-print fires on payment, not on every order.** `handlePlaceOrder` prints automatically
  only when the cart being placed/edited includes at least one payment line (`cart.payments.length
  > 0`) — a plain "send to kitchen" with no payment yet does **not** auto-print; the same order
  re-placed later once payment is actually taken does. The manual Print button still works
  anytime, for reprints.

### 7.9 The IQ POS Till Android app (replaces browser + Termux bridge)

A separate Android project (**not** part of this Next.js repo/build — a standalone Gradle/Kotlin
project) that wraps the Till in a WebView and exposes printing natively, so a Sunmi/Android device
doesn't need Termux running at all. Source isn't checked into this repo (it was generated and
built ad hoc); recreate it from this description if it needs to change:

- `MainActivity.kt` — a single-Activity WebView loading the platform's own URL (`res/values/strings.xml`'s
  `pos_url`, currently `https://pos.luvder.com/`), with `addJavascriptInterface(PrintBridge(),
  "AndroidPrintBridge")`. Extends plain `android.app.Activity`, **not**
  `AppCompatActivity` — the first build used `AppCompatActivity` with a plain `android:Theme.*`
  parent (`themes.xml`), which crashes on launch every time with `You need to use a Theme.AppCompat
  theme (or descendant) with this activity`. Nothing here needs AppCompat widgets, so the fix was
  switching the base class rather than the theme — also dropped the now-unused
  `androidx.appcompat`/`androidx.core` dependencies entirely, which cut the APK from ~3.4MB to
  ~0.8MB as a side effect.
- Launcher icon: `res/mipmap-*/ic_launcher*.png`, a teal rounded-square "IQ POS" wordmark generated
  from an SVG (`sharp`, the same image library already used for the printed receipt's logo) —
  not the restaurant's own logo, just the app's own identity on the home screen.
- `PrintBridge.kt` — the native counterpart to `lib/local-print-bridge.ts`: a `@JavascriptInterface
  fun print(printerIp, printerPort, escposHex)` that hex-decodes and writes straight to a raw
  `java.net.Socket` on a background thread, fire-and-forget. **No local HTTP server at all** inside
  the app (unlike the Termux bridge) — same-process native call instead, which also sidesteps
  Chrome's Private Network Access restrictions entirely.
- `lib/local-print-bridge.ts` on the web side checks `window.AndroidPrintBridge` first and calls it
  directly when present; it only falls back to the HTTP bridge (`public/downloads/iq-print-bridge.js`,
  Termux) when that global doesn't exist — so the exact same web code path serves both a plain
  browser+Termux setup and the APK, with no restaurant-specific branching needed.
- Distributed as a debug-signed APK (fine for sideloading; not a Play Store release) hosted at
  **`/get`** (`src/app/get/page.tsx`, linking to the static file at `public/downloads/iq-pos-till.apk`)
  — a public, unauthenticated page (see `CUSTOMER_FACING_PREFIXES` in `src/proxy.ts`) so it's
  reachable from a bare device browser before anything else is set up. Rebuilding it requires the
  Android SDK (`compileSdk 34`, AGP 8.7.2, Kotlin 1.9.24) — not installed in every environment this
  project gets worked on from; if that tooling isn't available, this is out of reach without it.

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
  sent order, the payment-lock/redo flow (see §14 changelog). The cart panel is one header row
  (order type + action icons), the table/customer summary, the order tray (the only part that
  grows), then Total with small **Offers** (`DiscountsModal`) and **Split** (`SplitBillModal`)
  buttons, the payment buttons and the main button. Split pays each guest's share inside the
  popup via `paySplitShare` — payment lines stay one per method (`addPayment` merges), and once
  the bill is fully paid the popup closes and calls `handlePlaceOrder`.
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
| Local network print (§7.8 — the one actually in use) | `app/settings/printers-client.tsx` (`LocalNetworkPrintRow`), `app/super-admin/printers`, `components/printer-setup-guide.tsx`, `public/downloads/iq-print-bridge.js` + `install-print-bridge.{sh,ps1}` | `lib/actions/printers.ts` (`saveLocalPrinterAction`), `lib/actions/local-print.ts` | `lib/local-print-bridge.ts`, `lib/escpos-ticket.ts` |
| Sunmi Cloud Print (§7.7 — built, not in use) | `app/settings/printers-client.tsx` (`SunmiCloudPrintRow`) | `lib/actions/sunmi-print.ts` | `lib/data/sunmi-print.ts`, `lib/sunmi-print.ts`, `app/api/sunmi/printTicket/*` |
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
| `NEXT_PUBLIC_APP_URL` | Lets `proxy.ts` recognize the platform's own domain vs a tenant's custom domain. Currently `https://pos.luvder.com` (set in Vercel project env vars, production target) — a custom domain added directly in the Vercel project, not `restaurants.customDomain` (that field is per-restaurant and layered *on top* of this one, see §7.5). Also the last-resort fallback for building loyalty magic-link email URLs (`lib/actions/loyalty-auth.ts`'s `resolveOrigin`) — in practice those are built from the live request's `Host` header instead, so this only matters if `headers()` can't be read |
| `BLOB_READ_WRITE_TOKEN` | Optional. Added by connecting a **public** Vercel Blob store to the project (production uses the `iq-pos-blob` store, connected 2026-10-22); lets the IQ site's `/build` page keep uploaded logos/menus/photos (`app/api/site/upload`). Without it only file names are kept. The Anthropic key for AI pre-fill is *not* an env var — Super Admin saves it (encrypted) in `platform_settings` |
| `RESEND_API_KEY`, `RESEND_SENDING_DOMAIN` | Sending loyalty OTP/magic-link emails (`src/lib/email.ts`) |
| `SUMUP_AFFILIATE_APP_ID`, `SUMUP_AFFILIATE_KEY` | Platform-level SumUp affiliate credentials (separate from each restaurant's own `sumupApiKey`) |
| `SUNMI_CLOUD_PRINT_APP_ID`, `SUNMI_CLOUD_PRINT_APP_KEY` | Platform-level Sunmi Cloud Print partner credentials (§7.7) — shared across every restaurant, issued once by Sunmi |
| `SUNMI_CLOUD_PRINT_BASE_URL` | Optional override, e.g. `https://uat.openapi.sunmi.com` for testing against Sunmi's sandbox before going live. Defaults to the production `https://openapi.sunmi.com` |

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
- **Sunmi Cloud Print (§7.7) is built but not in use and likely never will be for this account.**
  Sunmi's Cloud Print partner channel needed an enablement step beyond self-serve partner
  registration, and that was never obtained. The code is left in place (harmless, inert without
  `SUNMI_CLOUD_PRINT_APP_ID`/`KEY`) in case a future restaurant's Sunmi partner account does get it
  enabled, but **local network printing (§7.8) is the real, working path** — don't assume the
  Sunmi cloud route is what's printing tickets for any restaurant.
- **Local network print (§7.8) only auto-fires from the full desktop Till's Print button today**,
  guarded by a printer having both `localPrinterIp` set **and** `tillReceiptPrinter` turned on —
  it isn't wired into Kitchen Display ticket printing or the mobile/Simple Till (which has no print button at
  all). It's also only ever a *second*, best-effort print alongside the existing browser-print
  popup, never a replacement for it — if the local bridge isn't running, nothing about today's
  printing behavior changes. The bridge program itself (`public/downloads/iq-print-bridge.js`) has to be
  kept running by the restaurant (e.g. a persistent Termux session on the Till) — there's no
  supervision/auto-restart built in if it crashes or the device reboots.

- **No kitchen ticket (KOT) printing exists.** Adding a printer with a Kitchen/Bar/Expo station
  makes the Till say "Send to Kitchen" (see `hasKitchen` in `lib/types.ts`), but nothing is ever
  printed to it — only customer receipts print today (§7.8). Category → printer routing
  (`categories.printerId`, `dishes.printerId`) is stored but unused for printing.

## 14. Changelog

> **Instruction for every future change:** add a dated entry here (newest on top), *and* update
> whichever numbered section above actually describes the thing you changed, *and* add or update
> its how-to in the FAQ (`src/app/help-center/faq.ts` — the in-app Help Center and the public
> `/faq` page), re-capturing the marked screenshot in `public/help/` when the screen changed. A
> change without all three is not done. This guide plus that FAQ are the source for the final
> project documentation, so both must always match the live system. (Also in `CLAUDE.md`.)

### 2026-10-23 — Printer setup for Super Admin / regional admins, setup kit and scripts
- **Super Admin → Printers** (sidebar, super and regional admins): pick a restaurant and add,
  connect, test and switch Till auto-print for its printers and Kitchen Displays without signing
  in to it. Regional admins only see — and the actions only accept — their assigned restaurants
  (`printerScope` in `lib/actions/printers.ts`; see §7.8).
- **Setup kit** (same page, and a collapsible under Settings → Printers): steps, one-line
  installers, find/test commands, "Check this device", downloads and troubleshooting.
- **Scripts** in `public/downloads/` (served at pos.luvder.com/downloads/): `iq-print-bridge.js`
  (moved from `scripts/local-print-bridge.js`; v2 adds `find`, `test`, `--version`, binds to
  127.0.0.1, rejects non-hex bodies), `install-print-bridge.sh` (Termux/macOS/Linux, with
  autostart) and `install-print-bridge.ps1` (Windows, with autostart).
- Adding a Network/WiFi printer with an IP now saves it for local printing straight away; the
  field is labelled "IP address" for those connections.
- Tested: Linux installer end to end; bridge `find`/`test`/`POST /print` against a stand-in
  printer on :9100; a Super Admin adding a printer to another restaurant, turning on auto-print
  and Test Print reaching the printer through the bridge; a regional admin seeing only their
  restaurant. Not tested here: the Termux, macOS and Windows installers on real devices.
- FAQ: new "How do I get receipts printing from the Till?" (with screenshot) and "Can IQ set up
  our printers for us?"; the printers answer mentions entering the IP.

### 2026-10-22 (late) — Till cart: 7+ tray lines, Offers and Split popups
- The cart panel gives the order tray the height: the title block is gone (the order type row now
  shares the top line with the print/delete icons; the order number heads the tray), tray rows
  are compact 40px lines, and Discounts & Loyalty moved from an accordion above the total into an
  **Offers** button beside it that opens a popup. 7+ lines are visible at 1024×768, 1280×720 and
  1366×768, and all 9 test lines at 1280×800 and up (measured with 9 items).
- **Split** (beside the total) opens a popup: *Split equally* between N guests (default: the
  table's guest count) or *By items* (pick what each guest had; discounts/tax shared out in
  proportion, the last guest pays exactly what's left). Each share is paid there by Cash (with
  cash-given → change) or a card machine; SumUp/Teya readers are charged for just that share.
  Close (X) any time — payments taken stay on the order. When fully paid the popup closes itself
  and completes the order, same as Take Payment. No schema change: same-method shares merge into
  one payment line, and cash received accumulates across cash shares.
- Help Center: new "split the bill between guests" how-to; screenshots re-captured for the new
  cart layout.

### 2026-10-22 (night) — IQ website on iq.luvder.com, AI website brief, public FAQ
- **Marketing site** under `app/site`, served at the root of **iq.luvder.com**: `proxy.ts`
  rewrites that host (and `iq.localhost` for local testing) to `/site/...`, leaving `/api`,
  `/faq` and static files alone. On any other host the pages are at `/site/...`, so links go
  through `getSiteBase()` (`app/site/_components/site-base.ts`). Pages: home, `/products/<slug>`
  for each of the 10 products, `/build`. Product data (names, taglines, Live / Early access /
  Coming soon, copy, screenshots) lives in one list, `lib/site/products.ts`. Screenshots are
  the clean Demo Café captures in `public/site/shots`. Sign in links go to pos.luvder.com/login.
- **Website brief (`/build`)**: describe → logo/menu/photo uploads → "Read my details" →
  review the pre-filled fields → a few questions (products wanted, style, pages, domain,
  timing, contact) → saved to `website_requests`.
  - `POST /api/site/analyse` does the pre-fill. With an Anthropic key saved it calls Claude
    (`lib/site/extract-ai.ts`: Opus 5.5, structured output, server-side refusal fallback on),
    sending the menu PDFs/images and logo directly. Otherwise, or if that call fails, it runs
    pattern matching (`lib/site/extract-basic.ts`: name, phone, email, site, Instagram, UK
    address/postcode, hours, cuisine, colour names/hex, wanted products, and price lines from
    the menu PDF text via `unpdf`). Logo colours are always worked out in the browser.
  - Uploads go browser → Vercel Blob via `POST /api/site/upload` (`handleUpload`: images and PDFs
    only, 15MB, `website-requests/` prefix) when `BLOB_READ_WRITE_TOKEN` is set. Without it,
    the files ride inside the analyse request instead (≤4MB total), and only their names are kept.
  - Rate limits: uploads and analyse are limited per IP in memory (best-effort); submit allows
    5 per hour per IP-hash, checked in the database.
- **Super Admin → Website Requests** (`/super-admin/website-requests`, super_admin only; sidebar
  link and a button with the "new" count on Super Admin): status filter, a detail drawer
  (contact, original text, extracted fields, files, menu, answers, internal notes), and the
  **AI reading** card that saves/tests/removes the Anthropic key. The key is stored AES-256-GCM
  encrypted with a key derived from JWT_SECRET (`lib/platform-settings.ts`) — rotating
  JWT_SECRET makes it read as "not set". Only the last 4 characters are shown.
- **Public FAQ** at `/faq` (both hosts, no sign-in): the Help Center's content and screenshots
  with a public header. `HelpCenterClient` takes an optional `title`.
- New packages: `@vercel/blob`, `unpdf`, `@anthropic-ai/sdk`, `zod`.
- **New tables — run once on Turso** (until then the requests page shows a notice and the
  Super Admin count is hidden; nothing else touches them):
  ```sql
  CREATE TABLE `platform_settings` (
  	`key` text PRIMARY KEY NOT NULL,
  	`value` text NOT NULL,
  	`updated_at` integer NOT NULL
  );
  
  CREATE TABLE `website_requests` (
  	`id` text PRIMARY KEY NOT NULL,
  	`status` text DEFAULT 'new' NOT NULL,
  	`restaurant_name` text NOT NULL,
  	`contact_name` text NOT NULL,
  	`contact_email` text NOT NULL,
  	`contact_phone` text,
  	`description` text NOT NULL,
  	`details` text NOT NULL,
  	`files` text NOT NULL,
  	`extracted_with` text DEFAULT 'basic' NOT NULL,
  	`ip_hash` text,
  	`admin_notes` text,
  	`created_at` integer NOT NULL,
  	`updated_at` integer
  );
  ```

### 2026-10-22 — Help Center FAQ with marked screenshots; fixes it surfaced
- **Help Center** (`app/help-center`) replaces the "coming soon" placeholder: 42 Q&As in 9 sections
  (`faq.ts`), searchable, collapsible, with a section nav. Each how-to has numbered steps that
  match red numbered markers on its screenshot in `public/help/*.webp` (34 images, ~1.8MB,
  clickable to enlarge). Screenshots are of a made-up "Demo Café" (generic staff, dishes, "Card
  A/B" card machines) captured from the real pages against a throwaway local database — to
  refresh them, re-seed and re-run that capture rather than editing images by hand.
- Fixes found while capturing:
  - Kitchen Display: ticket grid used viewport breakpoints (`lg:grid-cols-4`) inside a narrower
    panel, so Served/Complete overflowed the card; now `auto-fill minmax(210px,1fr)` and the
    action buttons wrap. The ticket timer gets `suppressHydrationWarning` (server and browser
    render it seconds apart — it was a dev-overlay hydration error).
  - Till cart header on an open order (title + 5 icons + 3-line subtitle) overflowed the 380px
    cart; title/subtitle now truncate and icons are 36px below `xl`.
  - Till: loyalty "Find / Enroll" was pushed out of the cart (input now `min-w-0`); the cash
    "Received" box was squeezed to ~45px by the change amount (change now on its own line); the
    tray's 7.5rem minimum only applies on screens ≥860px tall.
  - Manage Tables header buttons no longer wrap their labels onto two lines.
  - Dashboard billing badges said "Pending" for unpaid orders — confusing now that "Pending"
    means "awaiting acceptance" — they read "Unpaid", or "To accept" for customer orders.
- A 4-page A4 brochure for restaurants was made separately as a Design canvas (not in the repo).

### 2026-10-21 (late night) — Free a table, or all tables at once
- New `freeTablesAction(tableIds?)` in `lib/actions/tables.ts`: sets the given tables (or, with no
  ids, every table of the restaurant) to available / 0 seated / no seatedAt. Orders are never
  touched — an open order on a freed table stays in Open Tickets until paid or voided.
- Till → Tables: a "Free table" pill on every occupied or reserved tile (previously the ✕ only
  appeared on an occupied table with no order), and "Free all tables (N)" beside the legend,
  counting every area. Both confirm first when a table still has an open order. Tiles in a row
  now share one height.
- Manage Tables: "Free all tables" in the header (per-table "Mark as Available" was already in
  each table's popover).

### 2026-10-21 (night) — Online orders need accepting on the Till; per-sound volume
- New order status **"Pending"** for website / table-QR / kiosk orders, with Accept/Reject on the
  Till's new red **Online** tab — full design in §7.5. Kitchen Display ignores Pending; Open
  Tickets only counts accepted orders; dashboard "active" includes Pending; auto-void sweeps it.
  Opening a pending order (e.g. from its table) jumps to the Online tab instead; the mobile Till
  refuses to edit one. Customer confirmation now says "Order received — the team will confirm it
  shortly" instead of "sent to the kitchen".
- **Sounds**: `lib/order-sounds.ts` gains per-kind volumes (`incoming`, `kitchenNew`, `ready`, 0–1)
  in localStorage (`iq-pos-sound-volumes`, per device) and a new, distinct `playIncomingOrderAlert`
  (kiosk orders used to make no sound on the Till at all). New `components/sound-settings.tsx`
  (🔊 button: a slider + Test per sound, Mute all) on the Till and Kitchen Display headers.
- Till header fits one row from 11" up: "QR Menu Orders" / "Draft List" "SOON" placeholders
  removed (QR ordering now exists), short labels below `2xl` ("New", "Tickets", "Online"),
  New Order is a "+" and fullscreen hides below `xl`.
- Verified locally end to end (phone places table-QR order → Till's Online tab shows 1 within
  10s while Tickets doesn't count it → Accept → In Kitchen, Tickets +1; a second order → Reject →
  Voided "Online order not accepted").

### 2026-10-21 (evening) — Restaurant logo as icon + social-share image on public ordering pages
- New `app/order/[slug]/layout.tsx` (`generateMetadata`) covers the online order page, kiosk and
  table-QR pages: title "<Restaurant> · Order online", favicon/apple icon and Open Graph/Twitter
  image all from the restaurant's logo. `metadataBase` is built from the request's
  `x-forwarded-host`, so share previews are correct on a custom domain (order.hellochai.co.uk),
  pos.luvder.com and iq-pos.vercel.app alike.
- New route `app/order/[slug]/brand-image` (`?w=&h=&v=`): fetches `invoiceLogoUrl` (5s timeout,
  8MB cap), letterboxes it on white with sharp — square icon, or a 1200×630 card with margins —
  falling back to `public/brand/iq-pos-logo.png`. Under `/order/<slug>/` on purpose: `proxy.ts`
  leaves that prefix alone on custom domains. `v` = hash of the logo URL, to bust caches.
- `app/favicon.ico` moved to `public/favicon.ico`: as an app-folder file it was auto-linked on
  every page ahead of the restaurant's icon. Staff pages still get their icon from the root
  layout's `generateMetadata` (`/api/pwa-icon/...`), and `/favicon.ico` is still served.
- order.hellochai.co.uk added to the iq-pos Vercel project (it had DNS but wasn't attached, so
  TLS failed). Every custom ordering domain must be added there as well as in Super Admin.

### 2026-10-21 (latest) — Signed table QR codes: order with no sign-in, download/print per table
- New `lib/table-qr-token.ts` (HMAC-signed `<tableId>.<sig>` tokens), page
  `app/order/[slug]/table/[token]`, and `placeTableQrOrderAction` in `lib/actions/public-order.ts`
  — see §7.5 for the full design. `placePublicOrderAction`'s item re-pricing and
  dedupe/insert/seat steps were extracted into `buildItemsFromLiveMenu` / `insertPublicOrder` so
  both actions share them unchanged.
- `OnlineOrderClient` gains a `tableQr` mode: table badge in the header, table fixed in checkout
  (no picker), "Email or Phone Number" field, no loyalty-code badge (`loyaltyMember` now optional).
- Manage Tables: QR button on every table tile and in the table popover (previously only shown
  when the flag was on, and it encoded the forgeable `?table=n` link); new "Table QR Codes" sheet.
  If the restaurant's table-QR flag is off, the modals warn that scanning shows "unavailable".
- Verified end to end against a local SQLite copy of the schema (not production): scan → order →
  row in `orders` (table 5, Dine in, In Kitchen, prices from the menu, contact saved) and table
  seated; swapped table id / other restaurant slug / edited signature all rejected; 7th order in
  15 min refused; the downloaded PNG decodes back to the signed link.

### 2026-10-21 (later) — Till: today's takings in the header; table & guests collapsed by default
- **"Today" Cash / Card / total beside "Till · <restaurant>"** — new `components/today-sales.tsx`,
  passed through a new `headerExtra` prop on `AppShell` → `Topbar` (`titleExtra`) and
  `LockedShell` (shared Till-device logins). `order-line/page.tsx` computes it from orders placed
  since `businessDayStart` (the restaurant's open time/timezone), so it resets each business day,
  and updates with the Till's 20s `router.refresh`. Shown to everyone who can open the Till.
- **One tender-counting helper**: `salesByTender()` in `lib/types.ts` (voided skipped, payment lines
  first, legacy `paymentMethod` fallback, "Cash" vs every other method = card). End Day's
  `summarizeShiftWindow` now uses it too, so the Till's figures and the day-end report can't drift.
- **Cart setup**: the Order Type chips are always visible as one swipe row (no more Change link /
  `channelPickerOpen`); below them, table & guests (or customer details / provider) is a closed
  one-line row — "Choose table · 2 guests  Table & guests ▾" — that opens the fields + Done only
  when tapped. It starts closed on load, New Order, the cart's trash button and after placing an
  order (`tableEditorOpen` now defaults to false). Hidden for "Online", which has no fields.

### 2026-10-21 — Till: denser dish grid, one header row, setup box fits
From photos of the Hello Chai Till (11", collapsed sidebar):
- **Dish tiles are compact** — grid min 130px (168px at `2xl`), 48px emoji, 40px −/+ (44px at
  `2xl`), smaller text/padding — 5 columns on a 1280px screen instead of 3 large, mostly-empty ones.
- **One header row**: New Order + the view tabs on the left, fullscreen/refresh pushed right (the
  "SOON" placeholders sit after the tabs at `2xl`). The separate New Order/search row is gone.
- **Search lives in the category row**: a fixed "Search" tile before the swiped categories; tapping
  it swaps the row for a large search box with a result count and close button (`searchOpen`
  state). Categories are smaller (108×76px).
- **Swipe rows hide their scrollbar** (`[scrollbar-width:none]` + webkit) and fade at the right edge
  (`mask-image`) to hint at more — the visible bar read as a grey line under Order Type.
- **Cart setup box fits without inner scrollbars**: tighter padding, 44px Order Type chips, 44px
  table/guest controls with the guest count unboxed, 44px Done; while it's open the tray's minimum
  drops to 4rem. The one-line setup summary is `shrink-0` (at 720px tall it was being squashed under
  the Order Tray heading). On screens under 760px tall the tray minimum and the payment-lines box
  shrink further so the main button always fits.
- Verified with the real `OrderLineClient` and sample data (temporary page, not committed) at
  1280×800, 1280×720, 1194×834, 1920×1080, 2560×1440.

### 2026-10-20 (latest) — Till: fixed screen layout, sliding rows, name-matched category icons
- **Nothing on the Till scrolls as a whole page any more** (`order-line-client.tsx`). The main
  column is a flex column with `min-h-0`: the view tabs, New Order + search row and category row
  are `shrink-0`; only each view's own content box scrolls — the dish grid sits in its own grey
  box (`flex-1 overflow-y-auto`), and Open Tickets / History / Tables wrap their grids the same way.
- **One-row sliding strips** (`overflow-x-auto snap-x`): menu categories (fixed-width
  `CategoryBox`), Open Tickets filter chips, and the cart's Order Type picker (was a 3×2 grid).
- **Cart bottom always fits**: the panel is `overflow-hidden`; the setup box and order tray give up
  height (`min-h-0`, tray min 7.5rem) so totals, payment methods and the main button stay on screen
  — previously an open setup box pushed the cart past the screen and the whole page scrolled.
  Compacted to fit 1280×800: Table + Guests share one row, Subtotal only shows when a
  discount/coupon/tax sits between it and the total, payment-method buttons are one 48px row
  (icon beside label), tighter payment lines.
- Space: the page `h1` "Till" and the Refresh label only show at `2xl` (the top bar already says
  "Till · <restaurant>"); the "SOON" QR Menu / Draft List placeholders only show at `2xl`; the
  search box moved onto the New Order row.
- **Category icons match the category name first** (`NAME_ICONS` in
  `components/category-icon.tsx`, Till only via the new `name` prop): milk → Milk, juice → Citrus,
  mojito → Martini, shakes → IceCreamCone, pickle/uppilittathu → Amphora (jar), combos → Package,
  snacks → Popcorn, etc. — the 14 pickable icons are generic, so a cafe's many drinks categories
  all showed the same cup. Unmatched names fall back to the icon picked in Manage Dishes.
- Selected dish tiles use the brand colour outline instead of teal.
- Verified by rendering the real `OrderLineClient` with sample data (temporary local page, not
  committed) at 1280×800, 1194×834, 1920×1080 and 2560×1440: the page never scrolls, Done and the
  main button stay visible.

### 2026-10-20 (later) — Fix: Till buttons spilling out of their tiles
- The touch-sizing change below kept viewport breakpoints (`xl:grid-cols-4` etc.), but the menu
  area is the viewport minus the sidebar (240px) and the cart (400px+) — at 1280px a dish tile was
  ~127px wide while its price + 44px −/qty/+ row needs ~190px, so buttons overflowed onto
  neighbouring tiles. Till grids (categories, dishes, open tickets, history, tables) now use
  `grid-cols-[repeat(auto-fill,minmax(<min>,1fr))]`, so column count follows the space actually
  available and a tile never drops below its minimum (dish 176px / 196px at 2xl, category 120px,
  order card 210px, table 170px).
- Dish tile footer is stacked: price on its own line, then a full-width − qty + row.
- The table tile's "clear" X sits inside the tile (`right-1.5 top-1.5`) instead of hanging over the
  neighbour; cart panel is 380px (400px at xl, 460px at 2xl).
- Checked with a static Tailwind harness of the tile markup at 1280/1366/1920/2560px — no child
  overflows its tile — not the live app with real data.

### 2026-10-20 — Till sized for touch screens (11"–27")
- **Full Till only** (`order-line-client.tsx`; the mobile Till and admin pages are untouched).
  Every tappable control on the Till is now at least ~44px tall (`min-h-11`): toolbar/view tabs,
  New Order, search (larger input + clear button), queue/history/table tabs, cart header icons,
  order-type/table/guest controls, note/remove buttons, Discounts & Loyalty, and payment-line
  controls. Inputs use `text-base` (also stops iOS/Android zoom-on-focus). Icons inside toolbar
  buttons are enlarged via the `[&>svg]:size-5` arbitrary variant rather than per-icon edits.
- **Whole dish tile is tappable** — tapping anywhere on an in-stock tile adds it to the cart
  (`role="button"`, Enter/Space via `onKeyDown`); the stock toggle and −/+ buttons stop
  propagation so they don't double-add. −/+ are 44px, the image/emoji area is taller, names wrap
  to two lines.
- Category boxes, table tiles, payment-method buttons (`min-h-16`) and the main
  Place Order / Take Payment button (`min-h-14`) are larger; the cart panel is wider (420px).
- **Extra step for large screens:** at Tailwind `2xl` (≥1536px, i.e. 24–27" displays) grids gain a
  5th column, the cart grows to 480px, and key buttons/text step up once more.

### 2026-10-17 — Accounts login visible in Settings
- The restricted `accounts` login (role `accounts`, see `lib/accounts-filter.ts`) has existed since
  2026-10-02 but was invisible: `listStaff` only returns `admin`/`staff`, so no screen showed which
  accounts@ email a restaurant got. New "Accounts Login" section in Settings (below Staff) shows it
  via `getAccountsLogin()` in `lib/data/staff.ts`.
- Restaurants onboarded before auto-creation existed may have no accounts login — the section
  offers "Create accounts login" (`createAccountsLoginAction` in `lib/actions/staff.ts`), using the
  same rules as onboarding: accounts@<first admin's domain> (accounts+<slug>@ if taken) with the
  admin's password hash, so the existing admin→accounts password sync applies from then on.
  Restricted to admin / super / regional admin — explicitly not `accounts` itself, since the shared
  `assertAdmin` guard only blocks `staff`.

### 2026-10-16 (later) — Till cart layout; voids roll off daily; reports use counted takings
- **Till cart panel (`CartPanel` in `order-line-client.tsx`) is now a fixed layout** instead of
  one long scroll region: (1) a setup box — Order Type + table/guests or customer details — that
  collapses to a one-line summary with an Edit button once Done is tapped; the Order Type picker
  shows every option until one is picked (`CartState.channelChosen`, UI-only), then collapses to
  that one with a Change link; (2) the Order Tray, which scrolls on its own; (3) a pinned bottom
  block — a collapsed "Discounts & Loyalty" section (scrolls inside when opened), totals, payment
  methods (split-payment lines scroll inside), and the main button. The header's pencil button
  was removed in favour of the summary row's Edit.
- **Voided orders roll off the Till queue at each business-day start.** A void never counts as
  "closed out" (served + paid), so they used to sit in the queue forever. `queueOrders` now drops
  voids created before `businessDayStart(...)`; History still shows them by date.
- **Shift report headline is now "Total Taken"** = counted cash taken + every card machine's
  entered end-of-day total (`shiftTotals()` in `lib/types.ts`: cash taken = drawer counted − float
  + cash expenses + envelope cash). POS-recorded paid sales and the difference are shown as the
  sub-line, plus a per-method Taken / POS / Difference table. Unpaid orders are listed separately
  and excluded. The Dashboard's shift lists use the same figure.
- **Fix:** the old "Card Machine Reconciliation" section and the admin "day close didn't balance"
  notification both treated POS **Cash** as a card terminal with £0 counted, so every report and
  notification showed a false "Cash short by <all cash sales>". Cash is now reconciled only as the
  drawer count.

### 2026-10-16 — Restaurant/Cafe business type; kitchen features follow the devices actually added
- **`restaurants.businessType`** (`"restaurant"` | `"cafe"`, default `"restaurant"`) — set on the
  Super Admin create form, editable in Settings → Restaurant. A cafe is counter-service: in
  `placeOrderAction`, a *new* order whose payments cover its full total (tax included, via
  `orderBreakdown`) is created straight as `Served` (with `servedAt`/`closedOutAt` set) instead of
  `In Kitchen`. Unpaid/part-paid cafe orders still go to the kitchen. This was originally built on
  2026-10-03 (commit `0db25b7`) but only ever lived on the stale `claude/restaurant-pos-system-8huber`
  branch — it never reached `main`, which is why the toggle "wasn't in the dashboard". Ported fresh.
  Needs `ALTER TABLE restaurants ADD COLUMN business_type …` — run before deploy.
- **Kitchen gating** — `hasKitchenDisplay()` / `hasKitchen()` in `lib/types.ts`, computed from the
  restaurant's printers: a Kitchen Display is an active entry of kind `display`/`both`; a kitchen
  printer is an active `printer`/`both` entry whose station isn't `Receipt`. The sidebar hides
  "Kitchen Display" when there's no display; the Till (full + mobile) says "Send to Kitchen" only
  when `hasKitchen`, otherwise "Place Order"; the Wait List stepper says "Start Order" instead of
  "Send to Kitchen" likewise.
- **"Take Payment"** — the Till's main button now reads "Take Payment" once Cash or a card
  machine has been added on this Till (not for a recalled order whose payment was recorded earlier,
  which stays "Update Order"). Replaces the old "Place Order"/"Confirm Payment" wording for paid orders.
- **Known gap found while doing this:** the Till never prints kitchen tickets (KOT) at all — the
  only printing anywhere is the customer receipt (manual Print + auto-print on payment, §7.8). A
  kitchen-station printer currently only affects the button wording above. See §13.

### 2026-10-14 — Magic-link URLs now follow the live request domain; receipt QR note to 14 days; Rice Club menu import
- `lib/actions/loyalty-auth.ts`'s `resolveOrigin` (used to build the magic-link URL emailed to
  customers) previously only chose between a restaurant's `customDomain` and the static
  `NEXT_PUBLIC_APP_URL` — correct at the time, but meant a tenant reached via a second domain
  (e.g. `iq-pos.vercel.app`, or a future additional domain) got links pointing at
  `pos.luvder.com` instead of the domain they were actually using. Now reads the live request's
  `Host` header via `next/headers` as the preferred fallback (after `customDomain`, before the
  static env var) — see the updated `NEXT_PUBLIC_APP_URL` row in §12.
- Receipt QR footer text corrected from "Link valid for 1 week" to "Link valid for 14 days"
  (`lib/escpos-ticket.ts`) — this is informational copy only; the public `/invoice/[orderId]`
  page itself has no actual expiry/TTL enforcement (gated only by the order id being unguessable).
- **Investigated "loyalty email not received" for a newly onboarding restaurant.** Root cause:
  the `/my-card/[slug]/login` sign-in form calls `requestLoyaltyMagicLinkAction`, which **only
  sends an email if a matching `loyaltyMembers` row already exists** for that restaurant+contact
  (by design — the response is always `{ sent: true }` either way, so the flow can't be used to
  enumerate registered emails). It never creates a member. A brand-new restaurant with no loyalty
  sign-ups yet (no online orders via `requestOnlineOrderSignInAction`, no Till-side enrollment via
  `lib/actions/loyalty.ts`) will show the generic "check your email" success state for *any*
  address tested, with nothing actually sent and nothing logged — this fully explains a 7-day
  window of zero matching Vercel runtime log entries, since the no-member path never reaches
  `sendLoyaltyMagicLinkEmail` at all. `RESEND_SENDING_DOMAIN` is unset platform-wide (falls back
  to `mail.luvder.com`), but that domain is already verified and working for the platform's other
  tenants, so a Resend/domain misconfiguration was ruled out as the likely cause here.
- Added `rice-club-menu.sql` (generated from the restaurant's uploaded spreadsheet, not committed
  to the repo — sent directly to the user to run against production, same pattern as every other
  one-off data/schema SQL file in this changelog): 18 categories, 124 dishes.

### 2026-10-13 (later) — Fix: local-print selection was silently tied to the wrong flag
- The Till was selecting its receipt printer by `printers.isDefault` — a flag that actually means
  "the printer new menu categories route to," unrelated to Till printing. A restaurant could save
  a local printer's IP and never see the new receipt format, with no error, because its printer
  wasn't also flagged Default — discovered via a real restaurant (Al Zayt, with no local printer
  configured at all) correctly still showing the old browser-print receipt, which led to checking
  why a *different* restaurant with local printing set up was too.
- New: `printers.tillReceiptPrinter` — an explicit, admin-controlled "Use for Till auto-print"
  toggle in Settings → Printers, fully decoupled from `isDefault`. `order-line/page.tsx` now
  resolves the Till's print target from this flag instead. Migration SQL sent to the user and
  applied to production.
- `setTillReceiptPrinterAction` in `lib/actions/printers.ts` — same single-selection-per-restaurant
  pattern as `setDefaultPrinterAction`, refuses to enable it on a printer with no `localPrinterIp`
  saved yet.
- §7.8 and §13 updated to describe the real gating condition.

### 2026-10-13 — Fix: Till APK crashed on launch; added launcher icon
- The first Till APK crashed immediately on every install — `MainActivity` extended
  `AppCompatActivity` but the theme wasn't `Theme.AppCompat`-derived. Fixed by switching to a
  plain `android.app.Activity` (nothing in the app used AppCompat widgets anyway), which also
  dropped the now-unused AppCompat/core-ktx dependencies and shrank the APK from ~3.4MB to
  ~0.8MB. See §7.9.
- Added a real launcher icon (`res/mipmap-*`, a generated teal "IQ POS" wordmark) — the first
  build shipped with no custom icon at all.
- `public/downloads/iq-pos-till.apk` replaced with the fixed build (versionCode 2); `/get` serves
  the same path, nothing else changed there.

### 2026-10-12 (latest) — Receipt redesign for 80mm, auto-print on payment, Till APK, custom domain
- **Receipt content rewritten** for 80mm/48-column paper (`lib/escpos-ticket.ts`): mandatory logo
  (ESC/POS raster, falls back to restaurant-name text if unavailable — ⚠️ unverified against a
  real device), full contact block (new `restaurants.invoiceEmail` field + Settings UI field),
  order number, date/time, channel + table/guest count, **server name**, items grouped by menu
  category (`groupItemsByCategory` in `order-line-client.tsx`), Delivery/Take Away details moved
  to the bottom, subtotal/discount/coupon/tax, a **bold** total-payable line, a native ESC/POS QR
  code to the digital receipt with a "valid 1 week" note. No "packing charge" line — not a real
  feature in this app yet, see §7.8.
- **Web print popup removed for any restaurant with local printing configured** — scoped (not
  global) so restaurants without `localPrintTarget` keep the original browser-print behavior
  unchanged. See §7.8.
- **Auto-print on payment**: `placeOrderAction` now returns the placed/edited order's
  `{id, orderNumber}`; `handlePlaceOrder` uses it to auto-print only when the placement included
  payment lines, not on a plain send-to-kitchen. See §7.8.
- **New: the IQ POS Till Android app** (§7.9) — a WebView + native print-bridge APK replacing
  Termux for devices that can run it. `lib/local-print-bridge.ts` now checks for
  `window.AndroidPrintBridge` before falling back to the HTTP bridge. Distributed from the new
  public `/get` page (`src/app/get/page.tsx`, static file at `public/downloads/iq-pos-till.apk`).
- **Platform domain changed to `pos.luvder.com`** (added as a custom domain directly in the
  Vercel project, DNS configured by the user) — `NEXT_PUBLIC_APP_URL` updated in Vercel to match.
  Every restaurant is reachable at this domain (or their own `customDomain`, see §7.5) from here
  on; `iq-pos.vercel.app` still works (Vercel's own domain is never removed) but is no longer the
  canonical one referenced anywhere in code/docs.
- Migration: `restaurants.invoice_email` (text, nullable). SQL sent to the user — confirm applied
  before/alongside this shipping, per §12.1 (restaurants is the most heavily-queried table in the
  app).

### 2026-10-12 (later still) — Fix: bridge needed Private Network Access header
- `scripts/local-print-bridge.js` now sends `Access-Control-Allow-Private-Network: true` on every
  response — without it, Chrome on the Till silently blocked the real POST to `127.0.0.1:9200`
  after a successful preflight, surfacing only as a generic "Failed to fetch" with nothing useful
  logged on the bridge side. Found by testing Test Print from the actual Till device (testing from
  an unrelated laptop also failed, but that's expected — see §7.8, loopback-only by design).
- §7.8 updated with both caveats so this doesn't get re-debugged from scratch next time.

### 2026-10-12 (later same day) — Local network print bridge (the path actually used)
- Sunmi's Cloud Print partner channel turned out to be a dead end for this account (see below) —
  no self-serve way to get `app_id`/`app_key`. Pivoted to a much simpler alternative: the Sunmi
  NT311 (and most thermal printers) accept raw ESC/POS directly over TCP port 9100 on the local
  network, confirmed by testing against the real device.
- New: `scripts/local-print-bridge.js` (standalone, dependency-free Node program — not part of
  the Next.js app — run on any device on the same LAN as the printer, e.g. via Termux on the Till
  itself), `lib/local-print-bridge.ts` (client-side fetch to that bridge),
  `lib/actions/local-print.ts` (`buildTicketEscPosAction`, reuses `lib/escpos-ticket.ts`).
- Schema: `printers.localPrinterIp` + `printers.localPrinterPort`. Migration SQL sent to the
  user; confirmed applied before this shipped.
- Settings → Printers: "Connect Local Network Print" control (IP/port + Test Print) alongside the
  (now unused) Sunmi one.
- `order-line-client.tsx`'s `handlePrint` now also fires a silent, best-effort local-bridge print
  when the restaurant's default printer has a local IP set — alongside, never instead of, the
  existing browser-print popup.
- Added §7.8 to this guide; marked §7.7 (Sunmi Cloud Print) as built-but-unused in §13.

### 2026-10-12 — Sunmi Cloud Print integration (code-complete, unverified — see §13)
- New schema: `printers.sunmiSn` (opt-in per printer) + new table `sunmi_print_jobs` (the
  queue Sunmi's printer polls). Migration SQL sent to the user; **not yet applied to
  production** — do not merge/ship further changes to `printers`/`sunmi_print_jobs` ahead of
  confirming it ran, per §12.1.
- New: `lib/sunmi-print.ts` (signed API client + incoming-signature verification),
  `lib/escpos-ticket.ts` (ESC/POS ticket formatter, hex-encoded), `lib/data/sunmi-print.ts`,
  `lib/actions/sunmi-print.ts` (`saveSunmiPrinterSnAction`, `sendSunmiTestPrintAction`), and three
  callback routes under `src/app/api/sunmi/printTicket/`.
- Settings → Printers: each non-display printer now has an inline "Connect Sunmi Cloud Print"
  control (SN entry + Test Print button).
- Added §7.7 describing the full pull-based relay architecture, which is a fundamentally
  different shape from every other integration in this app (SumUp/Teya/webhooks are push-only
  REST; Sunmi requires us to also host a callback API the device itself calls).
- **Not done yet**: wiring this into the actual order-placed/sent-to-kitchen flow (today it's
  Test-Print-only), and end-to-end verification against a real device — both blocked on the
  user finishing Sunmi's Cloud Print partner channel enablement (`app_id`/`app_key` not yet
  issued as of this entry).

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
