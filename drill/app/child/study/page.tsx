import { redirect } from "next/navigation";
import { requireChildPage } from "@/server/auth";
import { ENABLED_SUBJECTS, SUBJECT_LABEL, type Subject } from "@/domain/settings";
import { StudyClient } from "./StudyClient";

export const dynamic = "force-dynamic";

export default async function StudyPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  await requireChildPage();
  const subject = ((await searchParams).subject ?? "math") as Subject;
  if (!ENABLED_SUBJECTS.includes(subject)) redirect("/child");
  return <StudyClient subject={subject} subjectLabel={SUBJECT_LABEL[subject]} />;
}
