import { redirect } from "next/navigation";
import { requireChildPage } from "@/server/auth";
import { SUBJECT_LABEL, type Subject } from "@/domain/settings";
import { getDB } from "@/server/db";
import { childSubjects } from "@/server/repo";
import { StudyClient } from "./StudyClient";

export const dynamic = "force-dynamic";

export default async function StudyPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { child } = await requireChildPage();
  const subject = ((await searchParams).subject ?? "math") as Subject;
  if (!(await childSubjects(await getDB(), child.id)).includes(subject)) redirect("/child");
  return (
    <StudyClient
      subject={subject}
      subjectLabel={SUBJECT_LABEL[subject]}
      furiganaMode={child.furigana_mode as "none" | "furigana" | "hiragana"}
    />
  );
}
