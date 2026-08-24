"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Category, Dish } from "@/lib/types";

const EMOJI_PRESETS = [
  "🍔", "🍕", "🍝", "🥗", "🍗", "🥩", "🍤", "🍜", "🍛", "🍣",
  "🥞", "🧇", "🥐", "🧁", "🍰", "🍮", "🍨", "🍫", "🥤", "☕",
  "🍹", "🌮", "🌯", "🥪", "🍟", "🍲", "🍅", "🥑", "🍳", "🥣",
];

interface DishModalProps {
  onClose: () => void;
  onSave: (values: { name: string; categoryId: string; price: number; emoji: string; description: string }) => void;
  categories: Category[];
  defaultCategoryId: string;
  initial?: Dish | null;
  currencySymbol?: string;
}

// Mount this component only while the modal should be visible (e.g. `{open && <DishModal ... />}`)
// so a fresh instance — and fresh initial state — is created each time it opens.
export function DishModal({ onClose, onSave, categories, defaultCategoryId, initial, currencySymbol = "£" }: DishModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? (defaultCategoryId === "all" ? categories[0]?.id ?? "" : defaultCategoryId)
  );
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🍽️");
  const [description, setDescription] = useState(initial?.description ?? "");

  const canSave = name.trim().length > 0 && categoryId && Number(price) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{initial ? "Edit Dish" : "Add New Dish"}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Dish Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Belgian Waffles"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Price ({currencySymbol})</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Icon</label>
            <div className="grid grid-cols-10 gap-1.5 rounded-xl border border-neutral-200 p-2">
              {EMOJI_PRESETS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-base transition-colors ${
                    emoji === e ? "bg-teal-100 ring-2 ring-teal-500" : "hover:bg-neutral-100"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short description"
              className="w-full resize-none rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
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
              canSave &&
              onSave({ name: name.trim(), categoryId, price: Number(price), emoji, description: description.trim() })
            }
            className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {initial ? "Save Changes" : "Add Dish"}
          </button>
        </div>
      </div>
    </div>
  );
}
