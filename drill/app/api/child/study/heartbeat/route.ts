import { getDB } from "@/server/db";
import { str, withChild } from "@/server/childApi";
import { heartbeat } from "@/server/study";

export async function POST(req: Request) {
  return withChild(async ({ child }, body) => heartbeat(await getDB(), child, str(body.sessionId), body.activeMs), req);
}
