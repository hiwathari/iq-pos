"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { KeyRound, Pencil, Plus, ShieldCheck, X } from "lucide-react";
import {
  createStaffAction,
  generateStaffPinAction,
  toggleStaffActiveAction,
  updateStaffCredentialsAction,
  updateStaffPermissionsAction,
  type CreateStaffState,
  type UpdateStaffState,
} from "@/lib/actions/staff";
import type { Role } from "@/lib/session";
import { DEFAULT_STAFF_PERMISSIONS, PERMISSION_KEYS, PERMISSION_LABELS } from "@/lib/permissions";

interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  tillPin: string | null;
  kitchenPin: string | null;
  permissions: string[] | null;
}

const initialState: CreateStaffState = {};
const initialEditState: UpdateStaffState = {};

export function StaffClient({ staff }: { staff: StaffRow[] }) {
  const [, startTransition] = useTransition();
  const [permissionsTarget, setPermissionsTarget] = useState<StaffRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffRow | null>(null);

  function handleToggle(userId: string, active: boolean) {
    startTransition(async () => {
      await toggleStaffActiveAction(userId, active);
    });
  }

  function handleGeneratePin(userId: string) {
    startTransition(async () => {
      await generateStaffPinAction(userId);
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Team</h2>
          <p className="text-sm text-neutral-500">
            Give a staff member a PIN so they can unlock the Till (
            <span className="font-mono text-neutral-700">/till-login</span>), the Kitchen Display (
            <span className="font-mono text-neutral-700">/kitchen-login</span>), or sign into their own dashboard (
            <span className="font-mono text-neutral-700">/staff-login</span>) on a shared device without typing a
            password — the same PIN works everywhere for that person.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
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
              <th className="px-5 py-3">PIN</th>
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
                <td className="px-5 py-3">
                  {s.tillPin ? (
                    <span className="font-mono text-sm font-semibold tracking-widest text-neutral-800">{s.tillPin}</span>
                  ) : (
                    <span className="text-xs text-neutral-400">Not set</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => setEditingStaff(s)}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleGeneratePin(s.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> {s.tillPin ? "Regen PIN" : "Set PIN"}
                    </button>
                    {s.role === "staff" && (
                      <button
                        onClick={() => setPermissionsTarget(s)}
                        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Permissions
                      </button>
                    )}
                    <button
                      onClick={() => handleToggle(s.id, !s.active)}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                    >
                      {s.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-neutral-400">
                  No staff accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && <AddStaffModal onClose={() => setModalOpen(false)} />}
      {editingStaff && <EditStaffModal staff={editingStaff} onClose={() => setEditingStaff(null)} />}
      {permissionsTarget && <PermissionsModal staff={permissionsTarget} onClose={() => setPermissionsTarget(null)} />}
    </div>
  );
}

function PermissionsModal({ staff, onClose }: { staff: StaffRow; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(staff.permissions ?? DEFAULT_STAFF_PERMISSIONS);
  const [pending, startTransition] = useTransition();

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function submit() {
    startTransition(async () => {
      await updateStaffPermissionsAction(staff.id, selected);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Permissions</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-400">
          What {staff.name} can see and use. Unchecked sections are hidden from their sidebar and blocked if they try
          to reach them directly.
        </p>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {PERMISSION_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50">
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={() => toggle(key)}
                className="h-4 w-4 accent-teal-600"
              />
              {PERMISSION_LABELS[key]}
            </label>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={pending}
          className="mt-5 w-full rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save Permissions"}
        </button>
      </div>
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
            className="w-full rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditStaffModal({ staff, onClose }: { staff: StaffRow; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(updateStaffCredentialsAction, initialEditState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && state?.success) {
      onClose();
    }
    wasPending.current = pending;
  }, [pending, state, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Edit Staff Account</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={staff.id} />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Full Name</label>
            <input
              name="name"
              required
              defaultValue={staff.name}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Login Email</label>
            <input
              name="email"
              type="email"
              required
              defaultValue={staff.email}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">New Password</label>
            <input
              name="password"
              type="password"
              minLength={8}
              placeholder="Leave blank to keep current password"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {state?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
