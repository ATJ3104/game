import { requireParentPage } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function ParentDashboard() {
  const { parent } = await requireParentPage();
  return <h1 className="text-xl font-bold">ようこそ、{parent.name} さん</h1>;
}
