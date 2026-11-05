import { describe, expect, it } from "vitest";
import { decideParentAccess, isValidPin } from "@/domain/access";
import { hashSecret, randomDigits, sha256Hex, verifySecret } from "@/server/crypto";

const now = new Date("2026-11-05T12:00:00Z");
const future = "2026-11-05T12:10:00Z";
const past = "2026-11-05T11:59:00Z";
const okSession = { expiresAt: "2026-12-01T00:00:00Z", pinUnlockedUntil: future };
const okParent = { pinHash: "x", mustChangePassword: false };

describe("decideParentAccess", () => {
  it("子ども端末として登録されたブラウザは、親のログイン・PIN が有効でも拒否", () => {
    expect(
      decideParentAccess({ hasValidDevice: true, session: okSession, parent: okParent, now, requirePin: true }).kind,
    ).toBe("child_device");
    expect(
      decideParentAccess({ hasValidDevice: true, session: okSession, parent: okParent, now, requirePin: false }).kind,
    ).toBe("child_device");
  });
  it("未ログイン・期限切れはログインへ", () => {
    expect(decideParentAccess({ hasValidDevice: false, session: null, parent: null, now, requirePin: true }).kind).toBe(
      "login",
    );
    expect(
      decideParentAccess({
        hasValidDevice: false,
        session: { ...okSession, expiresAt: past },
        parent: okParent,
        now,
        requirePin: true,
      }).kind,
    ).toBe("login");
  });
  it("PIN 未確認・期限切れは PIN 入力へ", () => {
    expect(
      decideParentAccess({
        hasValidDevice: false,
        session: { ...okSession, pinUnlockedUntil: null },
        parent: okParent,
        now,
        requirePin: true,
      }).kind,
    ).toBe("pin");
    expect(
      decideParentAccess({
        hasValidDevice: false,
        session: { ...okSession, pinUnlockedUntil: past },
        parent: okParent,
        now,
        requirePin: true,
      }).kind,
    ).toBe("pin");
  });
  it("PIN 未設定・仮パスワード", () => {
    expect(
      decideParentAccess({
        hasValidDevice: false,
        session: okSession,
        parent: { pinHash: null, mustChangePassword: false },
        now,
        requirePin: true,
      }).kind,
    ).toBe("set_pin");
    expect(
      decideParentAccess({
        hasValidDevice: false,
        session: okSession,
        parent: { pinHash: "x", mustChangePassword: true },
        now,
        requirePin: true,
      }).kind,
    ).toBe("change_password");
  });
  it("すべて満たせば ok", () => {
    expect(
      decideParentAccess({ hasValidDevice: false, session: okSession, parent: okParent, now, requirePin: true }).kind,
    ).toBe("ok");
  });
  it("PIN の形式", () => {
    expect(isValidPin("0123")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });
});

describe("ハッシュ化", () => {
  it("パスワード・PIN は平文を含まず、正しい値だけ検証が通る", async () => {
    const h = await hashSecret("1234");
    expect(h).not.toContain("1234$");
    expect(h.startsWith("pbkdf2$100000$")).toBe(true);
    expect(await verifySecret("1234", h)).toBe(true);
    expect(await verifySecret("1235", h)).toBe(false);
    expect(await hashSecret("1234")).not.toBe(h); // ソルトが毎回違う
  });
  it("トークンは SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("端末登録コードは6桁の数字", () => {
    for (let i = 0; i < 50; i++) expect(randomDigits(6)).toMatch(/^\d{6}$/);
  });
});
