import type { Segment } from "@/domain/math/question";

export type FuriganaMode = "none" | "furigana" | "hiragana";

/**
 * 国語の文を表示する。
 * - 問題の部分（target）は、漢字なら下線、読みなら枠で表示し、ふりがなは付けない（答えが分かってしまうため）
 * - それ以外の漢字は、子どもの設定にあわせて「そのまま／ふりがな／ひらがな」で表示
 */
export function RichText({ segments, mode }: { segments: Segment[]; mode: FuriganaMode }) {
  return (
    <p className="text-center text-3xl leading-[2.4] font-bold" data-testid="rich">
      {segments.map((s, i) => {
        if (s.t === "text") return <span key={i}>{s.v}</span>;
        if (s.t === "ruby") {
          if (mode === "hiragana") return <span key={i}>{s.rt}</span>;
          if (mode === "furigana")
            return (
              <ruby key={i}>
                {s.base}
                <rt className="text-xs font-normal">{s.rt}</rt>
              </ruby>
            );
          return <span key={i}>{s.base}</span>;
        }
        if (s.v) {
          return (
            <span key={i} data-testid="target" className="mx-1 border-b-4 border-amber-500 text-amber-700">
              {s.v}
            </span>
          );
        }
        return (
          <span key={i} data-testid="target" className="mx-1 rounded-lg border-4 border-amber-500 px-2 text-amber-700">
            {s.rt}
          </span>
        );
      })}
    </p>
  );
}
