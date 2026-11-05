"use client";

export type SpeechLang = "ja-JP" | "en-US";

const langPrefix = (lang: SpeechLang) => lang.slice(0, 2);
const voiceFor = (lang: SpeechLang) =>
  window.speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(langPrefix(lang)));

/** 日本語の読み上げが使えるか */
export function detectJaVoice(timeoutMs = 1500): Promise<boolean> {
  return detectVoice("ja-JP", timeoutMs);
}

/** その言語の読み上げが使えるか（声の一覧は遅れて届くことがあるので少し待つ） */
export function detectVoice(lang: SpeechLang, timeoutMs = 1500): Promise<boolean> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve(false);
  const has = () => !!voiceFor(lang);
  if (has()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(has()), timeoutMs);
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        window.clearTimeout(timer);
        resolve(has());
      },
      { once: true },
    );
  });
}

export function speakJa(text: string): void {
  speak(text, "ja-JP");
}

export function speak(text: string, lang: SpeechLang = "ja-JP"): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = lang === "en-US" ? 0.85 : 0.8;
  const voice = voiceFor(lang);
  if (voice) u.voice = voice;
  synth.speak(u);
}
