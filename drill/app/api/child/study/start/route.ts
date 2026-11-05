import { getDB } from "@/server/db";
import { str, withChild } from "@/server/childApi";
import { startOrResume, StudyError } from "@/server/study";
import { SUBJECTS, type Subject } from "@/domain/settings";

export async function POST(req: Request) {
  return withChild(async ({ child }, body) => {
    const subject = str(body.subject) as Subject;
    if (!SUBJECTS.includes(subject)) throw new StudyError("invalid", "きょうかが ただしくありません");
    return startOrResume(await getDB(), child, subject, { canSpeak: body.canSpeak === true });
  }, req);
}
