import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeviceContext } from "@/server/auth";
import { btnPrimary, btnSecondary } from "@/ui/ActionForm";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  if (await getDeviceContext()) redirect("/child");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-6xl" aria-hidden>📒</div>
        <h1 className="mt-2 text-3xl font-bold">まいにちドリル</h1>
        <p className="mt-2 text-gray-600">まいにち すこしずつ</p>
      </div>
      <Link href="/pair" className={`${btnPrimary} text-center`}>
        こどもの たんまつに する
      </Link>
      <Link href="/parent/login" className={`${btnSecondary} text-center`}>
        おうちの人（ログイン）
      </Link>
    </main>
  );
}
