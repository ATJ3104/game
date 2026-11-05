import { redirect } from "next/navigation";
import { checkParent, getDeviceContext } from "@/server/auth";

export const dynamic = "force-dynamic";

/** 入口：子ども端末なら子どもホーム、親がログイン中なら親画面、それ以外は最初の画面 */
export default async function Home() {
  if (await getDeviceContext()) redirect("/child");
  const { access } = await checkParent(false);
  if (access.kind !== "login") redirect("/parent");
  redirect("/welcome");
}
