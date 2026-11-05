"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StudyState, AnswerResult } from "@/server/study";
import type { Subject } from "@/domain/settings";
import { MathTokens, Frac } from "@/ui/MathView";
import { Keypad } from "@/ui/Keypad";
import { ChoicePad } from "@/ui/ChoicePad";
import { RichText, type FuriganaMode } from "@/ui/RichText";
import { detectJaVoice, speakJa } from "@/ui/speech";

type Phase = "loading" | "question" | "feedback" | "error";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    const err = new Error(data.error ?? "エラー") as Error & { code?: string; status?: number };
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * 「実際に解いていた時間」を測る。
 * - 画面が見えていて、最後の操作から idleSeconds 以内のときだけ数える
 * - それを過ぎたら止めて「つづける」を出す。別アプリ・画面を閉じている間は数えない
 */
function useActiveTimer(idleSeconds: number) {
  const r = useRef({ total: 0, sent: 0, last: 0, lastInteract: 0, running: true });
  const [paused, setPaused] = useState(false);
  const [, force] = useState(0);

  const tick = useCallback(() => {
    const t = r.current;
    const now = performance.now();
    if (t.running && document.visibilityState === "visible") {
      if (now - t.lastInteract > idleSeconds * 1000) {
        t.running = false;
        setPaused(true);
      } else {
        t.total += now - t.last;
      }
    }
    t.last = now;
  }, [idleSeconds]);

  useEffect(() => {
    const t = r.current;
    t.last = performance.now();
    t.lastInteract = t.last;
    const onInteract = () => {
      tick();
      r.current.lastInteract = performance.now();
    };
    const onVis = () => {
      tick();
      if (document.visibilityState !== "visible") {
        r.current.running = false;
        setPaused(true);
      }
    };
    const id = window.setInterval(() => {
      tick();
      force((x) => x + 1);
    }, 500);
    window.addEventListener("pointerdown", onInteract, true);
    window.addEventListener("keydown", onInteract, true);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerdown", onInteract, true);
      window.removeEventListener("keydown", onInteract, true);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tick]);

  const resume = useCallback(() => {
    const t = r.current;
    t.last = performance.now();
    t.lastInteract = t.last;
    t.running = true;
    setPaused(false);
  }, []);

  /** 未送信の時間を取り出す */
  const takeUnsent = useCallback(() => {
    tick();
    const t = r.current;
    const ms = Math.round(t.total - t.sent);
    t.sent = t.total;
    return ms;
  }, [tick]);

  const total = useCallback(() => {
    tick();
    return r.current.total;
  }, [tick]);

  return { paused, resume, takeUnsent, total, unsentMs: () => r.current.total - r.current.sent };
}

type Fields = string[];

function emptyFields(kind: string): Fields {
  return kind === "qr" ? ["", ""] : kind === "fraction" ? ["", "", ""] : kind === "choice" ? [] : [""];
}

function canSubmit(kind: string, f: Fields): boolean {
  if (kind === "qr") return f[0] !== "";
  if (kind === "fraction") return (f[1] !== "" && f[2] !== "") || (f[0] !== "" && f[1] === "" && f[2] === "");
  return f[0] !== "" && f[0] !== ".";
}

function toInput(kind: string, f: Fields) {
  if (kind === "qr") return { kind, q: f[0], r: f[1] };
  if (kind === "fraction") return { kind, whole: f[0], num: f[1], den: f[2] };
  return { kind, value: f[0] };
}

const FEEDBACK_TEXT: Record<string, string> = {
  reduce: "あと やくぶん！",
  can_reduce: "やくぶん できるよ",
};

export function StudyClient({
  subject,
  subjectLabel,
  furiganaMode = "none",
}: {
  subject: Subject;
  subjectLabel: string;
  furiganaMode?: FuriganaMode;
}) {
  const router = useRouter();
  const [state, setState] = useState<StudyState | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Fields>([""]);
  const [focus, setFocus] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [sending, setSending] = useState(false);
  const timer = useActiveTimer(state?.idleSeconds ?? 60);
  const shownAtTotal = useRef(0);

  const showQuestion = useCallback(
    (s: StudyState) => {
      setState(s);
      if (s.status === "done" || !s.question) {
        const q = new URLSearchParams({ subject });
        if (s.promotedTo) q.set("up", s.promotedTo);
        router.replace(`/child/done?${q.toString()}`);
        return;
      }
      setFields(emptyFields(s.question.kind));
      setFocus(s.question.kind === "fraction" ? 1 : 0);
      shownAtTotal.current = timer.total();
      setPhase("question");
      if (s.question.speak) speakJa(s.question.speak);
    },
    [router, subject, timer],
  );

  // 開始（または続きから）。国語は、聞き取り問題を出せるか（日本語の声があるか）を先に調べる
  const canSpeak = useRef<Promise<boolean> | null>(null);
  const startBody = async () => {
    canSpeak.current ??= subject === "japanese" ? detectJaVoice() : Promise.resolve(false);
    return { subject, canSpeak: await canSpeak.current };
  };
  useEffect(() => {
    startBody()
      .then((body) => post<StudyState>("/api/child/study/start", body))
      .then(showQuestion)
      .catch((e: Error) => {
        setError(e.message);
        setPhase("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  // 15秒ごとに時間を報告（残り時間のバーを正確にするため）
  useEffect(() => {
    if (!state || state.status === "done") return;
    const id = window.setInterval(() => {
      if (timer.unsentMs() < 1000) return;
      const ms = timer.takeUnsent();
      post<{ activeSeconds: number; targetSeconds: number }>("/api/child/study/heartbeat", {
        sessionId: state.sessionId,
        activeMs: ms,
      })
        .then((r) => setState((s) => (s ? { ...s, activeSeconds: r.activeSeconds } : s)))
        .catch(() => {});
    }, 15000);
    return () => window.clearInterval(id);
  }, [state, timer]);

  const onKey = (k: string) => {
    if (phase !== "question" || !state?.question) return;
    const kind = state.question.kind;
    if (k === "next") {
      setFocus((f) => (f + 1) % fields.length);
      return;
    }
    setFields((prev) => {
      const next = [...prev];
      const cur = next[focus] ?? "";
      if (k === "back") next[focus] = cur.slice(0, -1);
      else if (k === ".") {
        if (kind === "decimal" && !cur.includes(".")) next[focus] = (cur === "" ? "0" : cur) + ".";
      } else if (cur.length < 9) next[focus] = cur === "0" ? k : cur + k;
      return next;
    });
  };

  const submit = async (choiceIndex?: number) => {
    if (!state?.question || !state.qid || sending || phase !== "question") return;
    const isChoice = state.question.kind === "choice";
    if (isChoice ? choiceIndex === undefined : !canSubmit(state.question.kind, fields)) return;
    setSending(true);
    const responseMs = Math.round(timer.total() - shownAtTotal.current);
    try {
      const r = await post<AnswerResult>("/api/child/study/answer", {
        sessionId: state.sessionId,
        qid: state.qid,
        input: isChoice ? { kind: "choice", index: choiceIndex } : toInput(state.question.kind, fields),
        responseMs,
        activeMs: timer.takeUnsent(),
      });
      setResult(r);
      setPhase("feedback");
      if (r.correct) window.setTimeout(() => showQuestion(r.state), 700);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "stale") {
        // 別の画面で答えた等：最新の状態を取り直す
        startBody()
          .then((body) => post<StudyState>("/api/child/study/start", body))
          .then(showQuestion)
          .catch(() => {});
      } else {
        setError(err.message);
        if (err.code !== "invalid") setPhase("error");
      }
    } finally {
      setSending(false);
    }
  };

  // キーボードでも入力できる（PC での確認用）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (state?.question?.kind === "choice") {
        if (/^[1-4]$/.test(e.key)) void submit(Number(e.key) - 1);
        return;
      }
      if (/^[0-9]$/.test(e.key)) onKey(e.key);
      else if (e.key === ".") onKey(".");
      else if (e.key === "Backspace") onKey("back");
      else if (e.key === "Tab") {
        e.preventDefault();
        onKey("next");
      } else if (e.key === "Enter") void submit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (phase === "error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-xl font-bold">{error || "エラーが おきました"}</p>
        <button className="min-h-12 rounded-2xl bg-amber-500 px-6 text-lg font-bold text-white" onClick={() => router.replace("/child")}>
          ホームへ
        </button>
      </main>
    );
  }
  if (!state || phase === "loading") {
    return <main className="flex min-h-dvh items-center justify-center text-xl">じゅんびちゅう…</main>;
  }

  const unsentSec = timer.unsentMs() / 1000;
  const progress = Math.min(1, (state.activeSeconds + unsentSec) / state.targetSeconds);
  const q = state.question;
  const kind = q?.kind ?? "int";

  const fieldBox = (i: number, label: string, wide = false) => (
    <button
      type="button"
      onClick={() => setFocus(i)}
      aria-label={label}
      data-testid={`field-${i}`}
      className={`inline-flex min-h-14 ${wide ? "min-w-28" : "min-w-16"} items-center justify-center rounded-xl border-4 bg-white px-2 text-3xl font-bold tabular-nums ${
        focus === i && phase === "question" ? "border-amber-500" : "border-gray-200"
      }`}
    >
      {fields[i] || <span className="text-base font-normal text-gray-300">{label}</span>}
    </button>
  );

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="space-y-2 p-3">
        <div className="flex items-center justify-between text-sm font-bold text-gray-600">
          <span>
            {subjectLabel}・{state.levelCode}
          </span>
          {state.status === "retry" ? (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700" data-testid="retry-banner">
              まちがいなおし のこり {state.retryRemaining}もん
            </span>
          ) : (
            <span>{progress >= 1 ? "この もんだいで おわり" : ""}</span>
          )}
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-label="のこりじかん">
          <div className="h-full rounded-full bg-amber-400 transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      <section className="relative flex flex-1 flex-col items-center justify-center gap-6 px-4">
        {q?.prompt && <p className="text-lg font-bold text-gray-700">{q.prompt}</p>}
        {q && q.tokens.length > 0 && (
          <div className="text-5xl">
            <MathTokens tokens={q.tokens} />
          </div>
        )}
        {q?.bigText && (
          <div className="text-8xl font-bold" data-testid="big-text">
            {q.bigText}
          </div>
        )}
        {q?.rich && <RichText segments={q.rich} mode={furiganaMode} />}
        {q?.speak && (
          <button
            type="button"
            onClick={() => speakJa(q.speak!)}
            className="min-h-14 rounded-2xl bg-sky-100 px-6 text-xl font-bold text-sky-800"
            data-testid="speak"
          >
            🔊 きく
          </button>
        )}
        <div className="flex items-center gap-3">
          {kind === "qr" && (
            <>
              {fieldBox(0, "こたえ", true)}
              <span className="text-xl font-bold">あまり</span>
              {fieldBox(1, "あまり")}
            </>
          )}
          {kind === "fraction" && (
            <>
              {fieldBox(0, "せいすう")}
              <Frac n={fieldBox(1, "ぶんし")} d={fieldBox(2, "ぶんぼ")} className="text-gray-700" />
            </>
          )}
          {(kind === "int" || kind === "decimal") && fieldBox(0, "こたえ", true)}
        </div>
        {kind === "fraction" && <p className="text-xs text-gray-500">たいぶんすうの ときは「せいすう」にも いれてね</p>}
        {error && phase === "question" && <p className="font-bold text-red-600">{error}</p>}

        {phase === "feedback" && result && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/90"
            data-testid="feedback"
            data-correct={result.correct ? "1" : "0"}
          >
            <div className={`text-[9rem] font-black leading-none ${result.correct ? "text-red-500" : "text-blue-500"}`}>
              {result.correct ? "〇" : "×"}
            </div>
            {result.feedback && <p className="text-xl font-bold text-amber-700">{FEEDBACK_TEXT[result.feedback]}</p>}
            {!result.correct && (
              <>
                <p className="text-lg">
                  こたえは <span className="text-3xl font-bold">{result.correctAnswer}</span>
                </p>
                <p className="text-sm text-gray-500">あとで もういちど でるよ</p>
                <button
                  className="min-h-14 rounded-2xl bg-amber-500 px-10 text-xl font-bold text-white"
                  onClick={() => showQuestion(result.state)}
                >
                  つぎへ
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <footer className="bg-amber-50 pb-[env(safe-area-inset-bottom)]">
        {kind === "choice" && q?.choices ? (
          <ChoicePad
            choices={q.choices}
            style={q.choiceStyle ?? "kana"}
            onChoose={(i) => void submit(i)}
            disabled={phase !== "question" || sending}
          />
        ) : (
          <Keypad
            onKey={onKey}
            showDot={kind === "decimal"}
            showNext={fields.length > 1}
            onSubmit={() => void submit()}
            submitDisabled={phase !== "question" || sending || !canSubmit(kind, fields)}
          />
        )}
      </footer>

      {timer.paused && state.status !== "done" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/60 p-6" data-testid="paused">
          <p className="text-2xl font-bold text-white">ひとやすみ ちゅう</p>
          <button className="min-h-16 rounded-2xl bg-amber-500 px-12 text-2xl font-bold text-white" onClick={timer.resume}>
            つづける
          </button>
        </div>
      )}
    </main>
  );
}
