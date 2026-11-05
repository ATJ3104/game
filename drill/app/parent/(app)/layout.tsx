import Link from "next/link";
import { requireParentPage } from "@/server/auth";
import { logoutAction } from "../auth-actions";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/parent", label: "ホーム" },
  { href: "/parent/special-days", label: "特別休み" },
  { href: "/parent/results", label: "月の結果" },
  { href: "/parent/settings", label: "設定" },
];

/** 親画面の共通レイアウト。ここで必ずログイン＋PIN を確認する（各ページ・各アクションでも個別に確認） */
export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const { parent } = await requireParentPage();
  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-white pb-24">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-bold">まいにちドリル（おうちの人）</span>
        <form action={logoutAction}>
          <button className="min-h-12 px-2 text-sm text-gray-500 underline">{parent.name}・ログアウト</button>
        </form>
      </header>
      <main className="p-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 border-t bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-2xl grid-cols-4">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="flex min-h-14 items-center justify-center text-sm font-bold text-gray-700">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
