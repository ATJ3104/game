"use client";

import { startTransition, useActionState } from "react";
import { btnSecondary } from "@/ui/ActionForm";
import type { PairingState } from "./actions";

export function PairingCode({
  childId,
  action,
}: {
  childId: string;
  action: (prev: PairingState, fd: FormData) => Promise<PairingState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={btnSecondary}
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("child_id", childId);
          startTransition(() => formAction(fd));
        }}
      >
        {pending ? "発行中…" : "端末登録コードを発行"}
      </button>
      {state.error && <p className="text-sm font-bold text-red-600">{state.error}</p>}
      {state.code && (
        <div className="rounded-2xl bg-amber-50 p-4 text-center">
          <p className="text-sm text-gray-600">子どものスマホで「こどもの たんまつに する」を開き、入力してください</p>
          <p data-testid="pairing-code" className="my-2 font-mono text-4xl font-bold tracking-[0.3em]">
            {state.code}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(state.expiresAt!).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}
            まで有効（10分）
          </p>
        </div>
      )}
    </div>
  );
}
