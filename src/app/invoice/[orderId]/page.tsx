import { notFound } from "next/navigation";
import { getOrderWithRestaurant } from "@/lib/data/orders";
import { brandCssVars } from "@/lib/color";
import { InvoiceClient } from "./invoice-client";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { tradeAccounts } from "@/db/schema";

export default async function InvoicePage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const row = await getOrderWithRestaurant(orderId);
  if (!row) notFound();

  const { order, restaurant } = row;
  // A sale for a trade account carries the company, its VAT number and payment terms (step 6.6).
  const [trade] = order.tradeAccountId ? await db.select().from(tradeAccounts).where(eq(tradeAccounts.id, order.tradeAccountId)).limit(1) : [];

  return (
    <div style={brandCssVars(restaurant.brandColor)}>
      <InvoiceClient
        order={{
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          status: order.status,
          tableNumber: order.tableNumber,
          channel: order.channel,
          items: order.items,
          extraDiscount: order.extraDiscount,
          couponCode: order.couponCode,
          couponDiscount: order.couponDiscount,
          payments: order.payments,
          paymentMethod: order.paymentMethod,
          cashReceived: order.cashReceived,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerAddress: order.customerAddress,
        }}
        trade={trade ? { companyName: trade.companyName, vatNumber: trade.vatNumber, billingAddress: trade.billingAddress, paymentTermsDays: trade.paymentTermsDays } : undefined}
        restaurantName={restaurant.name}
        currencySymbol={restaurant.currencySymbol}
        invoiceAddress={restaurant.invoiceAddress}
        invoicePhone={restaurant.invoicePhone}
        invoiceWebsite={restaurant.invoiceWebsite}
        invoiceLogoUrl={restaurant.invoiceLogoUrl}
        invoiceFooterText={restaurant.invoiceFooterText}
      />
    </div>
  );
}
