"use client";

// ブラウザの読み上げ（Web Speech API）。スマホで音が出ない原因になりやすい点に対策している：
// 1. iPhone / iPad の Safari は、画面をタップした流れで一度読み上げるまで、自動の読み上げを無視する
//    → 最初のタップで無音の読み上げをして「解錠」する（unlockSpeech）。解錠前は自動で読み上げない
// 2. cancel() の直後の speak() が捨てられることがある → 話していないときは cancel しない。始まらなければ1回やり直す
// 3. Chrome は読み上げ中の SpeechSynthesisUtterance がガベージコレクションされると止まる → 参照を持っておく
// 4. 一時停止のまま固まることがある → speak の前に resume()
// 5. 失敗しても画面に何も出ない → onError で知らせる
// 6. iPhone / iPad はマナーモード（消音スイッチ）だと読み上げが聞こえない
//    → ページを「メディア再生」として扱わせる（audioSession.type = "playback" と、無音の音声のくり返し再生）。
//      効くかどうかは iOS のバージョンによるので、画面にもマナーモードの案内を出す

export type SpeechLang = "ja-JP" | "en-US";

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;
const norm = (s: string) => s.replace("_", "-").toLowerCase();

/** その言語の声を選ぶ（言語が完全に一致し、端末内蔵の声を優先） */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: SpeechLang): SpeechSynthesisVoice | undefined {
  const want = norm(lang);
  const prefix = want.slice(0, 2);
  const score = (v: SpeechSynthesisVoice) => {
    const l = norm(v.lang);
    if (l !== want && !l.startsWith(prefix)) return -1;
    return (l === want ? 2 : 0) + (v.localService ? 1 : 0);
  };
  let best: SpeechSynthesisVoice | undefined;
  let bestScore = -1;
  for (const v of voices) {
    const s = score(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

const voiceFor = (lang: SpeechLang) => (supported() ? pickVoice(window.speechSynthesis.getVoices(), lang) : undefined);

/** 日本語の読み上げが使えるか */
export function detectJaVoice(timeoutMs = 1500): Promise<boolean> {
  return detectVoice("ja-JP", timeoutMs);
}

/** その言語の読み上げが使えるか（声の一覧は遅れて届くことがあるので少し待つ） */
export function detectVoice(lang: SpeechLang, timeoutMs = 1500): Promise<boolean> {
  if (!supported()) return Promise.resolve(false);
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

/** iPhone / iPad か（iPadOS は Mac として名乗るので、タッチの有無でも判定） */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/** 無音の WAV（0.5秒・8kHz・8bit）。アセットを持たずにその場で作る */
function silentWavUrl(): string {
  const n = 4000;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  dv.setUint32(4, 36 + n, true);
  str(8, "WAVEfmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  str(36, "data");
  dv.setUint32(40, n, true);
  buf.fill(128, 44); // 8bit の無音
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

let silentAudio: HTMLAudioElement | null = null;

/** iPhone / iPad で、消音スイッチの影響を受けない「メディア再生」として扱わせる（タップの流れで呼ぶ） */
function enterPlaybackMode(): void {
  if (!isIOS()) return;
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch {
    // 古い iOS には audioSession がない
  }
  try {
    if (!silentAudio) {
      silentAudio = new Audio(silentWavUrl());
      silentAudio.loop = true;
      silentAudio.setAttribute("playsinline", "");
    }
    void silentAudio.play().catch(() => {});
  } catch {
    // 再生できなくても読み上げは続ける
  }
}

/** 学習画面を出るときに、無音の再生を止める */
export function leavePlaybackMode(): void {
  try {
    silentAudio?.pause();
  } catch {
    // なにもしない
  }
}

let unlocked = false;
/** 読み上げ中の発話（ガベージコレクションで止まらないように持っておく） */
let current: SpeechSynthesisUtterance | null = null;
/** いま話しているのが「解錠」用の無音の発話か */
let currentIsUnlock = false;

export function isSpeechUnlocked(): boolean {
  return unlocked;
}

/** タップの流れで呼ぶ。無音の読み上げをして、以後の自動読み上げを許可させる */
export function unlockSpeech(): void {
  if (unlocked || !supported()) return;
  enterPlaybackMode();
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.onend = () => {
      if (current === u) currentIsUnlock = false;
    };
    current = u;
    currentIsUnlock = true;
    window.speechSynthesis.speak(u);
    unlocked = true;
  } catch {
    // 読み上げが使えない端末
  }
}

/** 画面のどこかを最初にタップしたときに解錠する。戻り値で解除 */
export function installSpeechUnlock(): () => void {
  if (!supported()) return () => {};
  const handler = () => unlockSpeech();
  window.addEventListener("pointerdown", handler, { capture: true, once: true });
  window.addEventListener("keydown", handler, { capture: true, once: true });
  return () => {
    window.removeEventListener("pointerdown", handler, { capture: true });
    window.removeEventListener("keydown", handler, { capture: true });
  };
}

export type SpeechProblem = "unsupported" | "no-voice" | "not-started" | "error";

export function speakJa(text: string): void {
  speak(text, "ja-JP");
}

/**
 * 読み上げる。始まらなかったときは1回だけやり直し、それでもだめなら onProblem で知らせる。
 * タップの処理の中から呼べば、その場で解錠もされる
 */
export function speak(text: string, lang: SpeechLang = "ja-JP", onProblem?: (p: SpeechProblem) => void): void {
  if (!supported()) {
    onProblem?.("unsupported");
    return;
  }
  const synth = window.speechSynthesis;
  const voice = voiceFor(lang);
  if (!voice && synth.getVoices().length > 0) onProblem?.("no-voice");
  enterPlaybackMode();
  unlocked = true;

  let started = false;
  let reported = false;
  const report = (p: SpeechProblem) => {
    if (!reported && !started) {
      reported = true;
      onProblem?.(p);
    }
  };
  const attempt = (retry: boolean) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = lang === "en-US" ? 0.85 : 0.8;
    u.volume = 1;
    if (voice) u.voice = voice;
    u.onstart = () => {
      started = true;
    };
    u.onerror = (e) => {
      // 次の読み上げで止めたときの interrupted / canceled は問題ではない
      if (e.error === "interrupted" || e.error === "canceled") return;
      if (retry) window.setTimeout(() => attempt(false), 150);
      else report("error");
    };
    current = u;
    currentIsUnlock = false;
    try {
      synth.resume();
      synth.speak(u);
    } catch {
      report("error");
      return;
    }
    window.setTimeout(() => {
      if (started || synth.speaking) return;
      if (retry) attempt(false);
      else report("not-started");
    }, 1500);
  };
  // 話しているときだけ止める（話していないのに cancel すると、直後の speak が捨てられる端末がある）。
  // 解錠用の無音の発話は止めずに後ろに並べる（cancel 直後の speak を避けるため）
  if ((synth.speaking || synth.pending) && !currentIsUnlock) synth.cancel();
  attempt(true);
}

/** テスト用：状態を戻す */
export function _resetSpeechForTest(): void {
  unlocked = false;
  current = null;
  currentIsUnlock = false;
}
