import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/ui/ActionForm";
import { logoutAction, pinAction } from "../auth-actions";
import { getParentContextWithoutPin } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function PinPage() {
  const { access, ctx } = await getParentContextWithoutPin();
  if (access.kind === "child_device") redirect("/child");
  if (access.kind === "login" || !ctx) redirect("/parent/login");
  if (access.kind === "change_password") redirect("/parent/password");
  const setting = access.kind === "set_pin";
  const pinProps = { type: "password", inputMode: "numeric" as const, pattern: "\\d{4}", maxLength: 4, required: true };
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-2xl font-bold">{setting ? "PIN を決めてください" : "PIN を入力"}</h1>
      <p className="mb-6 text-sm text-gray-600">{ctx.parent.name} さん</p>
      <ActionForm action={pinAction} submitLabel={setting ? "決定" : "ひらく"}>
        <Field label="PIN（4桁）" name="pin" autoFocus autoComplete="off" {...pinProps} />
        {setting && <Field label="PIN（確認）" name="pin2" autoComplete="off" {...pinProps} />}
      </ActionForm>
      <form action={logoutAction} className="mt-8 text-center">
        <button className="text-sm text-gray-500 underline">ログアウト</button>
      </form>
    </main>
  );
}
