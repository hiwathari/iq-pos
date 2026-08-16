"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createStaffAction, toggleStaffActiveAction, type CreateStaffState } from "@/lib/actions/staff";
import type { Role } from "@/lib/session";

interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

const initialState: CreateStaffState = {};

export function StaffClient({ staff, restaurantName }: { staff: StaffRow[]; restaurantName: string }) {
  const [, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);

  function handleToggle(userId: string, active: boolean) {
    startTransition(async () => {
      await toggleStaffActiveAction(userId, active);
    });
  }

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">{restaurantName}</p>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Team</h2>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Add Staff Account
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {staff.map((s) => (
              <tr key={s.id} className="hover:bg-neutral-50/60">
                <td className="px-5 py-3 font-medium text-neutral-800">{s.name}</td>
                <td className="px-5 py-3 text-neutral-500">{s.email}</td>
                <td className="px-5 py-3 text-neutral-500 capitalize">{s.role}</td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      s.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {s.active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => handleToggle(s.id, !s.active)}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    {s.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-neutral-400">
                  No staff accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && <AddStaffModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function AddStaffModal({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(createStaffAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
      onClose();
    }
    wasPending.current = pending;
  }, [pending, state, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Add Staff Account</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Full Name</label>
            <input
              name="name"
              required
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Temporary Password</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Role</label>
            <select
              name="role"
              defaultValue="staff"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {state?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
