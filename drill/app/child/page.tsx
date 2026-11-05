import { requireChildPage } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function ChildHome() {
  const { child } = await requireChildPage();
  return <main className="p-6">{child.name}</main>;
}
