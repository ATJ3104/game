import type { Token } from "@/domain/math/question";

/** 分数を縦に表示 */
export function Frac({ n, d, className }: { n: React.ReactNode; d: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex flex-col items-center align-middle leading-none ${className ?? ""}`}>
      <span className="px-1">{n}</span>
      <span className="my-1 block h-[3px] w-full min-w-[1.2em] rounded bg-current" />
      <span className="px-1">{d}</span>
    </span>
  );
}

export function MathTokens({ tokens }: { tokens: Token[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-bold tabular-nums" aria-label="もんだい">
      {tokens.map((t, i) => {
        if (t.t === "f") {
          const box = (v: string) =>
            v === "□" ? <span className="inline-block h-[1em] w-[1.2em] rounded border-4 border-amber-500 align-middle" /> : v;
          return <Frac key={i} n={box(t.n)} d={box(t.d)} />;
        }
        return <span key={i}>{t.v}</span>;
      })}
    </div>
  );
}
