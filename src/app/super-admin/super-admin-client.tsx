"use client";

import { useState } from "react";
import { Building2, ChefHat, Plus, ShoppingBag, Table2, Users, X } from "lucide-react";
import { impersonateRestaurantAction, toggleRestaurantActiveAction } from "@/lib/actions/restaurants";
import { CreateRestaurantForm } from "./create-restaurant-form";

interface RestaurantRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  staffCount: number;
  dishCount: number;
  tableCount: number;
  orderCount: number;
}

export function SuperAdminClient({
  restaurants,
  totals,
}: {
  restaurants: RestaurantRow[];
  totals: { restaurantCount: number; userCount: number; orderCount: number };
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Super Admin</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Add Restaurant
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Restaurants" value={String(totals.restaurantCount)} tint="bg-teal-50 text-teal-600" />
        <StatCard icon={Users} label="Platform Users" value={String(totals.userCount)} tint="bg-indigo-50 text-indigo-600" />
        <StatCard icon={ShoppingBag} label="Orders Placed" value={String(totals.orderCount)} tint="bg-amber-50 text-amber-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {restaurants.map((r) => (
          <div key={r.id} className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-neutral-900">{r.name}</h2>
                <p className="text-xs text-neutral-400">/{r.slug}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  r.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {r.active ? "Active" : "Suspended"}
              </span>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs text-neutral-500">
              <div className="rounded-lg bg-neutral-50 py-2">
                <Users className="mx-auto mb-1 h-3.5 w-3.5" />
                {r.staffCount} staff
              </div>
              <div className="rounded-lg bg-neutral-50 py-2">
                <ChefHat className="mx-auto mb-1 h-3.5 w-3.5" />
                {r.dishCount} dishes
              </div>
              <div className="rounded-lg bg-neutral-50 py-2">
                <Table2 className="mx-auto mb-1 h-3.5 w-3.5" />
                {r.tableCount} tables
              </div>
            </div>

            <div className="mt-auto flex gap-2">
              <form action={impersonateRestaurantAction.bind(null, r.id)} className="flex-1">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                >
                  Manage
                </button>
              </form>
              <form action={toggleRestaurantActiveAction.bind(null, r.id, !r.active)}>
                <button
                  type="submit"
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  {r.active ? "Suspend" : "Reactivate"}
                </button>
              </form>
            </div>
          </div>
        ))}
        {restaurants.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
            No restaurants yet. Create the first one to get started.
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Add Restaurant</h2>
              <button onClick={() => setModalOpen(false)} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <CreateRestaurantForm onDone={() => setModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-neutral-400">{label}</div>
        <div className="text-lg font-semibold text-neutral-900">{value}</div>
      </div>
    </div>
  );
}
