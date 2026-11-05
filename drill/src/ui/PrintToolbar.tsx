"use client";

/** 画面にだけ出す操作ボタン（印刷には出ない） */
export function PrintToolbar({ remakeHref }: { remakeHref: string }) {
  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-white p-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="min-h-12 rounded-xl bg-amber-500 px-5 font-bold text-white"
      >
        印刷する
      </button>
      <a href={remakeHref} className="flex min-h-12 items-center rounded-xl border px-4 font-bold text-gray-700">
        ちがう問題で作り直す
      </a>
      <a href="/parent/print" className="flex min-h-12 items-center px-2 text-sm text-gray-500 underline">
        もどる
      </a>
      <span className="text-xs text-gray-500">問題のあとに答えのページが続きます。印刷の画面で「PDF に保存」もできます。</span>
    </div>
  );
}
