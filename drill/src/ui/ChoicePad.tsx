"use client";

import type { ChoiceStyle } from "@/domain/math/question";

const SIZE: Record<ChoiceStyle, string> = {
  kana: "text-5xl",
  reading: "text-2xl",
  kanji: "text-4xl",
  emoji: "text-6xl",
  en: "text-3xl normal-case",
  meaning: "text-2xl",
  phrase: "text-lg leading-snug",
};

/** 4つの選択肢（2×2、大きなボタン）。押したらすぐ答える */
export function ChoicePad({
  choices,
  style,
  onChoose,
  disabled,
}: {
  choices: string[];
  style: ChoiceStyle;
  onChoose: (index: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 p-3" data-testid="choices">
      {choices.map((c, i) => (
        <button
          key={`${i}-${c}`}
          type="button"
          disabled={disabled}
          onClick={() => onChoose(i)}
          data-choice={c}
          className={`flex min-h-24 items-center justify-center rounded-2xl bg-white px-2 font-bold text-gray-800 shadow active:scale-95 active:bg-amber-100 disabled:opacity-60 ${SIZE[style]}`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
