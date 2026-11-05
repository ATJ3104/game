"use client";

/** 画面下部の大きなテンキー（ボタンは 48px 以上） */
export function Keypad({
  onKey,
  showDot,
  showNext,
  onSubmit,
  submitDisabled,
}: {
  onKey: (key: string) => void;
  showDot: boolean;
  showNext: boolean;
  onSubmit: () => void;
  submitDisabled: boolean;
}) {
  const key =
    "flex min-h-14 items-center justify-center rounded-2xl bg-white text-3xl font-bold text-gray-800 shadow active:scale-95 active:bg-amber-100 select-none";
  const digits = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
  return (
    <div className="grid grid-cols-4 gap-2 p-2" data-testid="keypad">
      <div className="col-span-3 grid grid-cols-3 gap-2">
        {digits.map((d) => (
          <button key={d} type="button" className={key} onClick={() => onKey(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={key} onClick={() => onKey("0")}>
          0
        </button>
        {showDot ? (
          <button type="button" className={key} onClick={() => onKey(".")} aria-label="しょうすうてん">
            .
          </button>
        ) : (
          <span />
        )}
        <button type="button" className={`${key} text-2xl`} onClick={() => onKey("back")} aria-label="けす">
          ⌫
        </button>
      </div>
      <div className="grid grid-rows-3 gap-2">
        {showNext ? (
          <button type="button" className={`${key} text-base`} onClick={() => onKey("next")}>
            つぎの
            <br />
            らん
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="row-span-2 flex items-center justify-center rounded-2xl bg-amber-500 text-xl font-bold text-white shadow active:scale-95 disabled:opacity-40"
        >
          こたえる
        </button>
      </div>
    </div>
  );
}
