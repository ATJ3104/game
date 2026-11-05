import { NextResponse } from "next/server";
import { getDeviceContext, refreshDeviceCookie, type DeviceContext } from "./auth";
import { StudyError } from "./study";

/** 子ども用 API の共通処理：端末トークンがなければ 401。例外を日本語のエラーに変換する */
export async function withChild(
  handler: (ctx: DeviceContext, body: Record<string, unknown>) => Promise<unknown>,
  req: Request,
): Promise<Response> {
  const ctx = await getDeviceContext();
  if (!ctx) return NextResponse.json({ error: "この たんまつは とうろく されていません" }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }
  try {
    const data = await handler(ctx, body);
    await refreshDeviceCookie();
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof StudyError) {
      const status = e.code === "not_found" ? 404 : e.code === "invalid" ? 400 : 409;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error(e);
    return NextResponse.json({ error: "エラーが おきました" }, { status: 500 });
  }
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
