import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { printers, sunmiPrintJobs } from "@/db/schema";

export async function findPrinterBySunmiSn(msn: string) {
  const [row] = await db.select().from(printers).where(eq(printers.sunmiSn, msn)).limit(1);
  return row ?? null;
}

export async function enqueueSunmiPrintJob(input: {
  restaurantId: string;
  printerId: string;
  orderId?: string | null;
  escposHex: string;
  voiceText?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(sunmiPrintJobs).values({
    id,
    restaurantId: input.restaurantId,
    printerId: input.printerId,
    orderId: input.orderId ?? null,
    escposHex: input.escposHex,
    voiceText: input.voiceText ?? null,
  });
  return id;
}

// Sunmi's own printer polls this repeatedly (oldest-first, up to 5 at a time per their spec) and
// keeps re-polling until it comes back empty. Marks the returned jobs "fetched" so a second poll
// that arrives before the printer reports back doesn't hand out the same job twice.
export async function pendingJobIdsForPrinter(printerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: sunmiPrintJobs.id })
    .from(sunmiPrintJobs)
    .where(and(eq(sunmiPrintJobs.printerId, printerId), eq(sunmiPrintJobs.status, "pending")))
    .orderBy(asc(sunmiPrintJobs.createdAt))
    .limit(5);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  await db
    .update(sunmiPrintJobs)
    .set({ status: "fetched", updatedAt: Date.now() })
    .where(inArray(sunmiPrintJobs.id, ids));
  return ids;
}

export async function getSunmiJobContent(jobId: string) {
  const [row] = await db.select().from(sunmiPrintJobs).where(eq(sunmiPrintJobs.id, jobId)).limit(1);
  return row ?? null;
}

export async function updateSunmiJobStatus(jobId: string, status: "printed" | "failed") {
  await db.update(sunmiPrintJobs).set({ status, updatedAt: Date.now() }).where(eq(sunmiPrintJobs.id, jobId));
}
