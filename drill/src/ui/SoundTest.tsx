"use client";

import { useEffect, useState } from "react";
import { detectVoice, pickVoice, speak, type SpeechLang, type SpeechProblem } from "@/ui/speech";

const SAMPLE: Record<SpeechLang, string> = {
  "en-US": "Hello! Let's study English.",
  "ja-JP": "こんにちは。きょうも がんばろう。",
};

/** 読み上げの確認（子どものホームに置く）。この端末で英語・日本語の声が出るかを試せる */
export function SoundTest() {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<Record<SpeechLang, string | null>>({ "en-US": null, "ja-JP": null });
  const [problem, setProblem] = useState<SpeechProblem | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const result: Record<SpeechLang, string | null> = { "en-US": null, "ja-JP": null };
      for (const lang of ["en-US", "ja-JP"] as const) {
        if (await detectVoice(lang)) {
          result[lang] = pickVoice(window.speechSynthesis.getVoices(), lang)?.name ?? "あり";
        }
      }
      setVoices(result);
    })();
  }, [open]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-12 text-sm text-gray-500 underline" data-testid="sound-test-open">
        🔊 おとの テスト
      </button>
    );
  }
  return (
    <section className="space-y-3 rounded-3xl bg-white p-4 shadow" data-testid="sound-test">
      <h2 className="font-bold text-gray-600">おとの テスト</h2>
      <div className="grid grid-cols-2 gap-3">
        {(["en-US", "ja-JP"] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => {
              setProblem(null);
              speak(SAMPLE[lang], lang, setProblem);
            }}
            className="min-h-14 rounded-2xl bg-sky-500 text-lg font-bold text-white shadow active:scale-95"
          >
            🔊 {lang === "en-US" ? "えいご" : "にほんご"}
          </button>
        ))}
      </div>
      <ul className="text-xs text-gray-600" data-testid="sound-test-voices">
        <li>えいごの こえ：{voices["en-US"] ?? "みつかりません"}</li>
        <li>にほんごの こえ：{voices["ja-JP"] ?? "みつかりません"}</li>
      </ul>
      {problem && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
          {problem === "unsupported" || problem === "no-voice"
            ? "この たんまつでは よみあげが つかえません。"
            : "おとが でませんでした。"}
        </p>
      )}
      <p className="text-xs leading-relaxed text-gray-500">
        きこえない ときは：おとの おおきさを あげる／iPhone・iPad は よこの マナーモードの スイッチを きる／
        iPhone は「せってい → アクセシビリティ → よみあげコンテンツ → 声」で えいご（English）の こえを ダウンロードする。
      </p>
    </section>
  );
}
