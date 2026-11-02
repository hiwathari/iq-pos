export const PO_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-neutral-100 text-neutral-600" },
  sent: { label: "Sent", tone: "bg-sky-50 text-sky-700" },
  part_received: { label: "Part received", tone: "bg-amber-50 text-amber-700" },
  received: { label: "Received", tone: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", tone: "bg-rose-50 text-rose-600" },
};
