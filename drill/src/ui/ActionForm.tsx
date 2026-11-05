"use client";

import { startTransition, useActionState } from "react";

export interface ActionFormState {
  error?: string;
  ok?: string;
}

type Action = (prev: ActionFormState, fd: FormData) => Promise<ActionFormState>;

function SubmitButton({ label, className, pending }: { label: string; className?: string; pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className={className ?? btnPrimary}>
      {pending ? "しょりちゅう…" : label}
    </button>
  );
}

export const btnPrimary =
  "min-h-12 w-full rounded-2xl bg-amber-500 px-4 py-3 text-lg font-bold text-white shadow active:scale-[0.98] disabled:opacity-50";
export const btnSecondary =
  "min-h-12 w-full rounded-2xl border-2 border-amber-500 bg-white px-4 py-3 text-lg font-bold text-amber-700 active:scale-[0.98] disabled:opacity-50";
export const btnSmall =
  "min-h-12 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base font-bold text-gray-700 active:scale-[0.98] disabled:opacity-50";
export const btnDanger =
  "min-h-12 rounded-xl border border-red-300 bg-white px-3 py-2 text-base font-bold text-red-600 active:scale-[0.98] disabled:opacity-50";
export const inputCls =
  "min-h-12 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-lg focus:border-amber-500 focus:outline-none";
export const labelCls = "mb-1 block text-sm font-bold text-gray-600";

export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  submitClassName,
}: {
  action: Action;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
  submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // React 19 は action 実行後にフォームを空にするので、onSubmit で送って入力を残す
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };
  return (
    <form onSubmit={onSubmit} className={className ?? "space-y-4"}>
      {children}
      {state.error && (
        <p role="alert" data-testid="form-error" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && <p className="rounded-xl bg-green-50 p-3 text-sm font-bold text-green-700">{state.ok}</p>}
      <SubmitButton label={submitLabel} className={submitClassName} pending={pending} />
    </form>
  );
}

export function Field({
  label,
  name,
  type = "text",
  ...rest
}: { label: string; name: string; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input name={name} type={type} className={inputCls} {...rest} />
    </label>
  );
}
