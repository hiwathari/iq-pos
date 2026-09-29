"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/types";

// Fixed categorical order, reused across every chart so a given series always reads the same
// color no matter which chart it appears in or how many other series are present.
export const CHART_COLORS = ["#0d9488", "#f59e0b", "#6366f1", "#f43f5e", "#a855f7", "#3b82f6", "#10b981", "#a3a3a3"];

function ChartTooltip({ active, payload, label, currencySymbol }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; currencySymbol: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md">
      {label && <div className="mb-1 font-semibold text-neutral-700">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5 text-neutral-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-neutral-900">{formatMoney(p.value, currencySymbol)}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueBarChart({
  data,
  currencySymbol,
  color = CHART_COLORS[0],
  height = 260,
}: {
  data: { label: string; value: number }[];
  currencySymbol: string;
  color?: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a3a3a3" }} axisLine={{ stroke: "#e5e5e5" }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "#a3a3a3" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatMoney(v, currencySymbol)}
          width={56}
        />
        <Tooltip content={<ChartTooltip currencySymbol={currencySymbol} />} cursor={{ fill: "#fafafa" }} />
        <Bar dataKey="value" name="Revenue" fill={color} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueLineChart({
  data,
  currencySymbol,
  color = CHART_COLORS[0],
  height = 260,
}: {
  data: { label: string; value: number }[];
  currencySymbol: string;
  color?: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a3a3a3" }} axisLine={{ stroke: "#e5e5e5" }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "#a3a3a3" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatMoney(v, currencySymbol)}
          width={56}
        />
        <Tooltip content={<ChartTooltip currencySymbol={currencySymbol} />} />
        <Line type="monotone" dataKey="value" name="Revenue" stroke={color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RevenuePieChart({
  data,
  currencySymbol,
  height = 260,
}: {
  data: { label: string; value: number }[];
  currencySymbol: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="#fff" strokeWidth={2}>
          {data.map((entry, i) => (
            <Cell key={entry.label} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [formatMoney(Number(value), currencySymbol), name]}
          contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e5e5" }}
        />
        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "#525252" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-sm text-neutral-400" style={{ height }}>
      No data yet.
    </div>
  );
}
