"use client";

/**
 * 単語カードの並べかえ。下のカードを押すと上の答えの列に入り、
 * 答えの列のカードを押すと下に戻る。全部ならべたら「こたえる」
 */
export function OrderPad({
  tiles,
  order,
  onChange,
  onSubmit,
  disabled,
}: {
  tiles: string[];
  order: number[];
  onChange: (order: number[]) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const used = new Set(order);
  const card =
    "min-h-12 rounded-xl border-2 bg-white px-3 py-2 text-xl font-bold text-gray-800 shadow-sm active:scale-95 disabled:opacity-40";
  return (
    <div className="space-y-3 p-3" data-testid="order-pad">
      <div
        className="flex min-h-16 flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-amber-400 bg-white/70 p-2"
        aria-label="こたえの ならび"
        data-testid="order-answer"
      >
        {order.length === 0 && <span className="px-2 text-sm text-gray-400">したの カードを じゅんばんに おしてね</span>}
        {order.map((i, pos) => (
          <button
            key={`${i}-${pos}`}
            type="button"
            disabled={disabled}
            className={`${card} border-amber-400`}
            onClick={() => onChange(order.filter((_, p) => p !== pos))}
          >
            {tiles[i]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" data-testid="order-tiles">
        {tiles.map((t, i) => (
          <button
            key={i}
            type="button"
            data-tile={t}
            disabled={disabled || used.has(i)}
            className={`${card} border-gray-200 ${used.has(i) ? "invisible" : ""}`}
            onClick={() => onChange([...order, i])}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={disabled || order.length === 0}
          onClick={() => onChange([])}
          className="min-h-14 rounded-2xl bg-white text-lg font-bold text-gray-700 shadow disabled:opacity-40"
        >
          やりなおす
        </button>
        <button
          type="button"
          disabled={disabled || order.length !== tiles.length}
          onClick={onSubmit}
          className="col-span-2 min-h-14 rounded-2xl bg-amber-500 text-xl font-bold text-white shadow active:scale-95 disabled:opacity-40"
        >
          こたえる
        </button>
      </div>
    </div>
  );
}
