import { getDB } from "@/server/db";
import { str, withChild } from "@/server/childApi";
import { submitAnswer, StudyError } from "@/server/study";
import { parseAnswerInput } from "@/domain/math/answer";

export async function POST(req: Request) {
  return withChild(async ({ child }, body) => {
    const input = parseAnswerInput(body.input);
    if (!input) throw new StudyError("invalid", "こたえを いれてね");
    return submitAnswer(await getDB(), child, {
      sessionId: str(body.sessionId),
      qid: str(body.qid),
      input,
      responseMs: body.responseMs,
      activeMs: body.activeMs,
    });
  }, req);
}
