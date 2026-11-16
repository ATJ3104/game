import Link from "next/link";
import { requireChildPage } from "@/server/auth";
import { ActionForm, btnDanger, Field } from "@/ui/ActionForm";
import { unpairAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function UnpairPage() {
  const { child } = await requireChildPage();
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-xl font-bold">この端末の登録を解除（おうちの人）</h1>
      <p className="mb-6 text-sm text-gray-600">
        この端末は「{child.name}」さんの端末として登録されています。解除すると最初の画面にもどり、おうちの人としてログインできるようになります。学習の記録は消えません。
      </p>
      <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-gray-700">
        入力するのは、<strong>この子どもを登録した家族アカウント</strong>のおうちの人のメールアドレスとパスワードです（PIN ではありません）。
        パスワードが分からないときは、ログインできている別の端末で「設定」→ この子どもの「端末」→「解除」を押すか、「設定」→「おうちの人」でパスワードを変更してください。
      </p>
      <ActionForm action={unpairAction} submitLabel="登録を解除する" submitClassName={`${btnDanger} w-full`}>
        <Field label="おうちの人のメールアドレス" name="email" type="email" autoComplete="email" required />
        <Field label="パスワード" name="password" type="password" autoComplete="current-password" required />
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        <Link className="text-gray-500 underline" href="/child">
          もどる
        </Link>
      </p>
    </main>
  );
}
