// The "accounts" role (see users.role) is a restricted view of the restaurant's own admin
// account: cash and the one payment terminal an admin has designated "default" are visible with
// full history, but every other named card terminal is only visible for the trailing 14 days —
// older orders that touch one are dropped entirely from whatever this role is shown, rather than
// just having their amounts hidden. A split payment counts as "touching" a terminal if any of its
// lines do. Shared by every data-fetcher that feeds the Dashboard or Reports pages so the two can
// never disagree about which orders an accounts login gets to see.
const RESTRICTED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function filterOrdersForAccountsRole<
  T extends { createdAt: number; paymentMethod: string | null; payments: { method: string; amount: number }[] | null },
>(orders: T[], defaultTerminalName: string | null, now = Date.now()): T[] {
  const cutoff = now - RESTRICTED_WINDOW_MS;
  return orders.filter((order) => {
    const methods = order.payments?.length ? order.payments.map((p) => p.method) : order.paymentMethod ? [order.paymentMethod] : [];
    const touchesRestrictedTerminal = methods.some((m) => m !== "Cash" && m !== defaultTerminalName);
    return !touchesRestrictedTerminal || order.createdAt >= cutoff;
  });
}
