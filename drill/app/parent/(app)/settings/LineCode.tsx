"use client";

import { startTransition, useActionState } from "react";
import { btnSecondary } from "@/ui/ActionForm";
import type { LineCodeState } from "./actions";

/** LINE 連携コードの発行（LINE のトークに送ってもらう） */
export function LineCode({
  action,
  label = "連携コードを発行",
  help = "この数字を、まいにちドリルの LINE アカウントのトークに送ってください",
  note = "まで有効（10分）。送ったあと、この画面を開き直すと「連携ずみ」になります。",
  testId = "line-code",
}: {
  action: (prev: LineCodeState, fd: FormData) => Promise<LineCodeState>;
  label?: string;
  help?: string;
  note?: string;
  testId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={btnSecondary}
        disabled={pending}
        onClick={() => startTransition(() => formAction(new FormData()))}
      >
        {pending ? "発行中…" : label}
      </button>
      {state.error && <p className="text-sm font-bold text-red-600">{state.error}</p>}
      {state.code && (
        <div className="rounded-2xl bg-green-50 p-4 text-center">
          <p className="text-sm text-gray-600">{help}</p>
          <p data-testid={testId} className="my-2 font-mono text-4xl font-bold tracking-[0.2em]">
            {state.code}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(state.expiresAt!).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}
            {note}
          </p>
        </div>
      )}
    </div>
  );
}
