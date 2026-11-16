import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/ui/ActionForm";
import { signupAction } from "../auth-actions";
import { getDeviceContext } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getDeviceContext()) redirect("/child");
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-2xl font-bold">家族アカウントを作成</h1>
      <p className="mb-6 text-sm text-gray-600">
        家族で1つだけ作ります。すでに家族のだれかが作っている場合は、ここで作らずに、その人の画面の「設定 → おうちの人を追加」で追加してもらってください（別々に作ると、進み具合が別々になります）。
      </p>
      <ActionForm action={signupAction} submitLabel="作成する">
        <Field label="お名前（表示用）" name="name" required maxLength={30} />
        <Field label="メールアドレス" name="email" type="email" autoComplete="email" required />
        <Field label="パスワード（8文字以上）" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <Field label="PIN（4桁の数字）" name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
        <Field label="PIN（確認）" name="pin2" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
        <p className="text-xs text-gray-500">PIN はおうちの人の画面に入るたびに聞かれます（子どもがスマホをさわったとき用）。</p>
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        <Link className="text-gray-500 underline" href="/parent/login">ログインにもどる</Link>
      </p>
    </main>
  );
}
