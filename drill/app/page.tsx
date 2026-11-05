import { getDB } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDB();
  const row = await db.prepare("SELECT COUNT(*) AS n FROM families").first<{ n: number }>();
  return <main className="p-6">まいにちドリル（families: {row?.n ?? 0}）</main>;
}
