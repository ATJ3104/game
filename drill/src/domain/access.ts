// 親画面・親APIへのアクセス可否（純粋関数）。サーバー側のすべての親用処理がこれを通る。

export type ParentAccess =
  | { kind: "ok" }
  | { kind: "child_device" } // 子ども端末として登録されたブラウザ → 親は一切不可
  | { kind: "login" } // 未ログイン
  | { kind: "set_pin" } // PIN 未設定（初回）
  | { kind: "change_password" } // 仮パスワードのまま
  | { kind: "pin" }; // PIN の確認が必要

export interface ParentAccessInput {
  hasValidDevice: boolean;
  session: { expiresAt: string; pinUnlockedUntil: string | null } | null;
  parent: { pinHash: string | null; mustChangePassword: boolean } | null;
  now: Date;
  /** PIN 不要の画面（PIN 入力画面そのもの等）なら false */
  requirePin: boolean;
}

export function decideParentAccess(input: ParentAccessInput): ParentAccess {
  if (input.hasValidDevice) return { kind: "child_device" };
  const { session, parent, now } = input;
  if (!session || !parent) return { kind: "login" };
  if (Date.parse(session.expiresAt) <= now.getTime()) return { kind: "login" };
  if (parent.mustChangePassword) return { kind: "change_password" };
  if (!parent.pinHash) return { kind: "set_pin" };
  if (!input.requirePin) return { kind: "ok" };
  if (!session.pinUnlockedUntil || Date.parse(session.pinUnlockedUntil) <= now.getTime()) {
    return { kind: "pin" };
  }
  return { kind: "ok" };
}

export const PIN_UNLOCK_MINUTES = 15;
export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MINUTES = 5;

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function isValidPassword(pw: string): boolean {
  return pw.length >= 8 && pw.length <= 128;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
