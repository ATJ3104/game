import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/ui/ActionForm";
import { changePasswordAction } from "../auth-actions";
import { getParentContextWithoutPin } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const { access, ctx } = await getParentContextWithoutPin();
  if (access.kind === "child_device") redirect("/child");
  if (access.kind === "login" || !ctx) redirect("/parent/login");
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-2xl font-bold">パスワードを変更</h1>
      <p className="mb-6 text-sm text-gray-600">仮パスワードから、自分のパスワードに変更してください。</p>
      <ActionForm action={changePasswordAction} submitLabel="変更する">
        <Field label="新しいパスワード（8文字以上）" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <Field label="新しいパスワード（確認）" name="password2" type="password" autoComplete="new-password" required minLength={8} />
      </ActionForm>
    </main>
  );
}
