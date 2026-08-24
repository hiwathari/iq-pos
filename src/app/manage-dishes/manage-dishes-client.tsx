"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CategoryIconView } from "@/components/category-icon";
import { DishModal } from "@/components/dish-modal";
import type { Category, Dish, Printer } from "@/lib/types";
import { formatMoney } from "@/lib/types";
import {
  createCategoryAction,
  createDishAction,
  deleteDishAction,
  updateDishAction,
  type CreateCategoryInput,
  type DishInput,
} from "@/lib/actions/menu";
import { LayoutGrid, List, Plus, Search, SlidersHorizontal, MoreVertical, Pencil, Trash2, X } from "lucide-react";

export function ManageDishesClient({
  categories,
  dishes,
  printers,
  currencySymbol,
}: {
  categories: Category[];
  dishes: Dish[];
  printers: Printer[];
  currencySymbol: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: dishes.length };
    for (const c of categories) m[c.id] = dishes.filter((d) => d.categoryId === c.id).length;
    return m;
  }, [dishes, categories]);

  const filteredDishes = useMemo(() => {
    return dishes.filter((d) => {
      const inCategory = selectedCategory === "all" || d.categoryId === selectedCategory;
      const matchesQuery = d.name.toLowerCase().includes(query.toLowerCase());
      return inCategory && matchesQuery;
    });
  }, [dishes, selectedCategory, query]);

  const categoryName =
    selectedCategory === "all" ? "All Dishes" : categories.find((c) => c.id === selectedCategory)?.name ?? "Dishes";

  function openAddDish() {
    setEditingDish(null);
    setDishModalOpen(true);
  }

  function openEditDish(dish: Dish) {
    setEditingDish(dish);
    setOpenMenuId(null);
    setDishModalOpen(true);
  }

  function handleSaveDish(values: DishInput) {
    startTransition(async () => {
      if (editingDish) {
        await updateDishAction(editingDish.id, values);
      } else {
        await createDishAction(values);
      }
      router.refresh();
    });
    setDishModalOpen(false);
    setEditingDish(null);
  }

  function handleDeleteDish(dishId: string) {
    setOpenMenuId(null);
    startTransition(async () => {
      await deleteDishAction(dishId);
      router.refresh();
    });
  }

  function handleAddCategory(input: CreateCategoryInput) {
    startTransition(async () => {
      await createCategoryAction(input);
      router.refresh();
    });
    setCategoryModalOpen(false);
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Category sidebar */}
      <div className="flex w-72 shrink-0 flex-col border-r border-neutral-200 bg-white p-5">
        <h1 className="mb-4 text-lg font-semibold text-neutral-900">Dishes Category</h1>
        <div className="flex-1 space-y-1 overflow-y-auto">
          <CategoryRow
            active={selectedCategory === "all"}
            icon="all"
            name="All Dishes"
            count={counts.all}
            onClick={() => setSelectedCategory("all")}
          />
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              active={selectedCategory === c.id}
              icon={c.icon}
              name={c.name}
              count={counts[c.id] ?? 0}
              onClick={() => setSelectedCategory(c.id)}
            />
          ))}
        </div>
        <button
          onClick={() => setCategoryModalOpen(true)}
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Add New Category
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-neutral-900">Manage Dishes</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search dishes"
                className="w-64 rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <button
              onClick={openAddDish}
              className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" /> Add New Dishes
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            {categoryName} ({filteredDishes.length})
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-neutral-200 bg-white p-1">
              <button
                onClick={() => setView("grid")}
                className={`rounded-lg p-1.5 ${view === "grid" ? "bg-teal-50 text-teal-600" : "text-neutral-400 hover:text-neutral-600"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("list")}
                className={`rounded-lg p-1.5 ${view === "list" ? "bg-teal-50 text-teal-600" : "text-neutral-400 hover:text-neutral-600"}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <button className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">
              <SlidersHorizontal className="h-4 w-4" /> Filter
            </button>
          </div>
        </div>

        {view === "grid" ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            <button
              onClick={openAddDish}
              className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/40 text-center text-teal-700 hover:bg-teal-50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-600 text-white">
                <Plus className="h-5 w-5" />
              </span>
              <span className="px-4 text-sm font-medium">Add New Dish to {categoryName}</span>
            </button>
            {filteredDishes.map((dish) => (
              <DishCard
                key={dish.id}
                dish={dish}
                categoryName={categories.find((c) => c.id === dish.categoryId)?.name ?? ""}
                menuOpen={openMenuId === dish.id}
                onToggleMenu={() => setOpenMenuId(openMenuId === dish.id ? null : dish.id)}
                onEdit={() => openEditDish(dish)}
                onDelete={() => handleDeleteDish(dish.id)}
                currencySymbol={currencySymbol}
              />
            ))}
            {filteredDishes.length === 0 && (
              <div className="col-span-full flex items-center justify-center py-16 text-sm text-neutral-400">
                No dishes found.
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-5 py-3">Dish</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredDishes.map((dish) => (
                  <tr key={dish.id} className="hover:bg-neutral-50/60">
                    <td className="flex items-center gap-3 px-5 py-3">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full text-base"
                        style={{ backgroundColor: dish.color }}
                      >
                        {dish.emoji}
                      </span>
                      <span className="font-medium text-neutral-800">{dish.name}</span>
                    </td>
                    <td className="px-5 py-3 text-neutral-500">
                      {categories.find((c) => c.id === dish.categoryId)?.name}
                    </td>
                    <td className="px-5 py-3 font-semibold text-neutral-800">{formatMoney(dish.price, currencySymbol)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditDish(dish)}
                          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-teal-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteDish(dish.id)}
                          className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredDishes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-neutral-400">
                      No dishes found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dishModalOpen && (
        <DishModal
          onClose={() => {
            setDishModalOpen(false);
            setEditingDish(null);
          }}
          onSave={handleSaveDish}
          categories={categories}
          defaultCategoryId={selectedCategory}
          initial={editingDish}
          currencySymbol={currencySymbol}
        />
      )}
      {categoryModalOpen && (
        <CategoryModal printers={printers} onClose={() => setCategoryModalOpen(false)} onSave={handleAddCategory} />
      )}
    </div>
  );
}

function CategoryRow({
  active,
  icon,
  name,
  count,
  onClick,
}: {
  active: boolean;
  icon: string;
  name: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
        active ? "border border-teal-500 bg-teal-50 text-teal-700 font-medium" : "text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <CategoryIconView icon={icon} className="h-4 w-4" />
        {name}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          active ? "bg-teal-600 text-white" : "bg-neutral-100 text-neutral-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function DishCard({
  dish,
  categoryName,
  menuOpen,
  onToggleMenu,
  onEdit,
  onDelete,
  currencySymbol,
}: {
  dish: Dish;
  categoryName: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEdit: () => void;
  onDelete: () => void;
  currencySymbol: string;
}) {
  return (
    <div className="relative flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 hover:shadow-md transition-shadow">
      <div className="mb-3 flex items-start justify-between">
        <input type="checkbox" className="h-4 w-4 rounded border-neutral-300 accent-teal-600" />
        <div className="relative">
          <button
            onClick={onToggleMenu}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-10 w-32 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
              <button
                onClick={onEdit}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-50"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                onClick={onDelete}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        className="mb-3 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
        style={{ backgroundColor: dish.color }}
      >
        {dish.emoji}
      </div>
      <div className="text-xs text-neutral-400">{categoryName}</div>
      <div className="mb-1 font-semibold text-neutral-900">{dish.name}</div>
      <div className="font-semibold text-neutral-800">{formatMoney(dish.price, currencySymbol)}</div>
    </div>
  );
}

function CategoryModal({
  printers,
  onClose,
  onSave,
}: {
  printers: Printer[];
  onClose: () => void;
  onSave: (input: CreateCategoryInput) => void;
}) {
  const defaultPrinter = printers.find((p) => p.isDefault) ?? printers[0] ?? null;
  const [name, setName] = useState("");
  const [printerId, setPrinterId] = useState<string>(defaultPrinter?.id ?? "");
  const [showOnKitchenDisplay, setShowOnKitchenDisplay] = useState(true);

  const canSave = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Add New Category</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Category Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Seafood"
              autoFocus
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Kitchen Printer</label>
            <select
              value={printerId}
              onChange={(e) => setPrinterId(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              <option value="">No printer</option>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? " (Default)" : ""}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={showOnKitchenDisplay}
              onChange={(e) => setShowOnKitchenDisplay(e.target.checked)}
              className="h-3.5 w-3.5 accent-teal-600"
            />
            Show on Kitchen Display
          </label>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={() =>
              canSave && onSave({ name: name.trim(), printerId: printerId || null, showOnKitchenDisplay })
            }
            className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add Category
          </button>
        </div>
      </div>
    </div>
  );
}
