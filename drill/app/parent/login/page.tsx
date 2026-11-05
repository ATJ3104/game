import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/ui/ActionForm";
import { loginAction } from "../auth-actions";
import { getParentContextWithoutPin } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const { access } = await getParentContextWithoutPin();
  if (access.kind === "child_device") redirect("/child");
  if (access.kind !== "login") redirect("/parent/pin");
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-bold">おうちの人のログイン</h1>
      <ActionForm action={loginAction} submitLabel="ログイン">
        <Field label="メールアドレス" name="email" type="email" autoComplete="email" required />
        <Field label="パスワード" name="password" type="password" autoComplete="current-password" required />
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        はじめての方は <Link className="font-bold text-amber-700 underline" href="/parent/signup">家族アカウントを作成</Link>
      </p>
      <p className="mt-2 text-center text-sm">
        <Link className="text-gray-500 underline" href="/welcome">もどる</Link>
      </p>
    </main>
  );
}
