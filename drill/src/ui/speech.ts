"use client";

/** 日本語の読み上げが使えるか（声の一覧は遅れて届くことがあるので少し待つ） */
export function detectJaVoice(timeoutMs = 1500): Promise<boolean> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve(false);
  const has = () =>
    window.speechSynthesis.getVoices().some((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ja"));
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
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.8;
  const voice = synth.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ja"));
  if (voice) u.voice = voice;
  synth.speak(u);
}
