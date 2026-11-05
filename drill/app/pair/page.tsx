import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeviceContext } from "@/server/auth";
import { ActionForm, inputCls } from "@/ui/ActionForm";
import { pairAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PairPage() {
  if (await getDeviceContext()) redirect("/child");
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-2xl font-bold">こどもの たんまつに する</h1>
      <p className="mb-6 text-gray-600">おうちの人に「たんまつ とうろく コード」を だしてもらって、いれてね。</p>
      <ActionForm action={pairAction} submitLabel="とうろく">
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          placeholder="123456"
          aria-label="6けたの コード"
          className={`${inputCls} text-center font-mono text-3xl tracking-[0.3em]`}
        />
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        <Link className="text-gray-500 underline" href="/welcome">もどる</Link>
      </p>
    </main>
  );
}
