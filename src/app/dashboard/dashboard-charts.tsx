"use client";

import { RevenueBarChart, RevenueLineChart, RevenuePieChart } from "@/components/charts";
import type { ReportData } from "@/lib/data/reports";
import { TrendingUp, PieChart as PieChartIcon } from "lucide-react";

export function DashboardCharts({ report, currencySymbol }: { report: ReportData; currencySymbol: string }) {
  const dailyData = report.dailySales.map((d) => ({ label: d.date.slice(5), value: d.revenue }));
  const channelData = report.byChannel.map((c) => ({ label: c.channel, value: c.revenue }));
  const categoryData = report.byCategory.slice(0, 8).map((c) => ({ label: c.category, value: c.revenue }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-2">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <TrendingUp className="h-4 w-4 text-teal-600" /> Sales Trend (Last 30 Days)
        </h2>
        <RevenueLineChart data={dailyData} currencySymbol={currencySymbol} height={240} />
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <PieChartIcon className="h-4 w-4 text-teal-600" /> Sales by Channel
        </h2>
        <RevenuePieChart data={channelData} currencySymbol={currencySymbol} height={240} />
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <TrendingUp className="h-4 w-4 text-teal-600" /> Top Categories by Revenue
        </h2>
        <RevenueBarChart data={categoryData} currencySymbol={currencySymbol} color="#6366f1" height={240} />
      </div>
    </div>
  );
}
