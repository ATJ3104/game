import { notFound, redirect } from "next/navigation";
import { requireParentPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { getChildLevel, getChildOfFamily } from "@/server/repo";
import { levelOptions } from "@/server/contentPolicy";
import { availableLevels, getLevel } from "@/domain/levels";
import { getJapaneseLevel } from "@/domain/japanese/levels";
import { buildKanjiSheet, buildMathSheet, clampCount, newSeed, type KanjiWriteItem } from "@/domain/print";
import { answerText } from "@/domain/math/answer";
import type { MathQuestion, Segment } from "@/domain/math/question";
import { MathTokens } from "@/ui/MathView";
import { PrintToolbar } from "@/ui/PrintToolbar";
import type { FuriganaMode } from "@/ui/RichText";

export const dynamic = "force-dynamic";

/** 1ページに収まるよう、問題数から1行の高さ（mm）と文字の大きさを決める */
function fitStyle(rows: number, opts: { maxRowMm: number; fontRatio: number; maxFontMm: number }): React.CSSProperties {
  const usable = 228; // A4 から余白・見出しを引いた高さ（mm）
  const row = Math.min(opts.maxRowMm, usable / Math.max(rows, 1));
  const font = Math.min(opts.maxFontMm, row * opts.fontRatio);
  return { ["--row" as string]: `${row.toFixed(2)}mm`, fontSize: `${font.toFixed(2)}mm` };
}

type SP = { child?: string; type?: string; level?: string; count?: string; seed?: string };

function SheetHeader({ title, sub, name, total, seed, answer }: { title: string; sub: string; name: string; total: number; seed: number; answer?: boolean }) {
  return (
    <header className="sheet-header">
      <div>
        <div className="sheet-title">
          {title}
          {answer && <span className="answer-badge">こたえ</span>}
        </div>
        <div className="sheet-sub">{sub}</div>
      </div>
      <table className="sheet-meta">
        <tbody>
          <tr>
            <th>なまえ</th>
            <td className="w-name">{name}</td>
            <th>ひづけ</th>
            <td>　　がつ　　にち</td>
          </tr>
          <tr>
            <th>じかん</th>
            <td>　　ふん　　びょう</td>
            <th>てん</th>
            <td>
              　　／ {total}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="sheet-no">No.{seed}</div>
    </header>
  );
}

function MathItem({ q, n, answer }: { q: MathQuestion; n: number; answer: boolean }) {
  const ans = answer ? answerText(q) : "";
  return (
    <li className="math-item">
      <span className="item-no">({n})</span>
      <div className="math-q">
        {q.prompt && <div className="math-prompt">{q.prompt}</div>}
        <MathTokens tokens={q.tokens} />
      </div>
      {q.kind === "qr" ? (
        <span className="math-ans">
          <span className={`blank ${answer ? "filled" : ""}`}>{answer ? q.qr!.q : ""}</span>
          <span className="amari">あまり</span>
          <span className={`blank small ${answer ? "filled" : ""}`}>{answer ? q.qr!.r : ""}</span>
        </span>
      ) : (
        <span className={`blank ${q.kind === "fraction" ? "wide" : ""} ${answer ? "filled" : ""}`}>{ans}</span>
      )}
    </li>
  );
}

function SentenceText({ segments, mode, item, answer }: { segments: Segment[]; mode: FuriganaMode; item: KanjiWriteItem; answer: boolean }) {
  return (
    <span className="kanji-sentence">
      {segments.map((s, i) => {
        if (s.t === "text") return <span key={i}>{s.v}</span>;
        if (s.t === "ruby") {
          if (mode === "hiragana") return <span key={i}>{s.rt}</span>;
          return (
            <ruby key={i}>
              {s.base}
              <rt>{mode === "furigana" ? s.rt : ""}</rt>
            </ruby>
          );
        }
        return (
          <ruby key={i} className="write-target">
            {item.parts.map((p, j) =>
              p.t === "box" ? (
                <span key={j} className={`write-box ${answer ? "filled" : ""}`}>
                  {answer ? p.answer : ""}
                </span>
              ) : (
                <span key={j} className="write-kana">
                  {p.v}
                </span>
              ),
            )}
            <rt className="write-rt">{s.rt}</rt>
          </ruby>
        );
      })}
    </span>
  );
}

export default async function PrintSheetPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { parent } = await requireParentPage();
  const sp = await searchParams;
  const type = sp.type === "kanji" ? "kanji" : "math";
  const db = await getDB();
  const child = await getChildOfFamily(db, parent.family_id, sp.child ?? "");
  if (!child) notFound();

  // 「いまのレベル」を実際のレベルに置きかえ、番号がなければ付けて、URL を固定する（同じプリントを作り直せるように）
  const opts = levelOptions();
  let level = sp.level ?? "current";
  if (level === "current") {
    const cur = await getChildLevel(db, child.id, type === "math" ? "math" : "japanese");
    const kanjiStart = availableLevels("japanese", opts).find((l) => getJapaneseLevel(l.code)?.kind === "kanji")?.code;
    level = type === "math" ? (cur ?? "M01") : cur && getJapaneseLevel(cur)?.kind === "kanji" ? cur : (kanjiStart ?? "K10");
  }
  const count = clampCount(type, Number(sp.count));
  const seed = Number(sp.seed);
  const base = `/parent/print-sheet?child=${child.id}&type=${type}&level=${level}&count=${count}`;
  if (!Number.isInteger(seed) || seed < 100000 || seed > 999999 || sp.level === "current") {
    redirect(`${base}&seed=${Number.isInteger(seed) && seed >= 100000 && seed <= 999999 ? seed : newSeed()}`);
  }
  const subject = type === "math" ? "math" : "japanese";
  if (!availableLevels(subject, opts).some((l) => l.code === level)) notFound();
  const levelName = getLevel(subject, level)?.name ?? level;
  const remakeHref = `${base}&seed=${newSeed()}`;

  if (type === "math") {
    const qs = buildMathSheet(level, count, seed);
    const sheet = (answer: boolean) => (
      <section className="sheet">
        <SheetHeader title="さんすう プリント" sub={`${level} ${levelName}`} name={child.name} total={qs.length} seed={seed} answer={answer} />
        <ol
          className="math-list"
          style={fitStyle(Math.ceil(qs.length / 2), {
            maxRowMm: 22,
            fontRatio: qs.some((q) => q.kind === "fraction" || q.tokens.some((t) => t.t === "f")) ? 0.3 : 0.5,
            maxFontMm: 6,
          })}
        >
          {qs.map((q, i) => (
            <MathItem key={i} q={q} n={i + 1} answer={answer} />
          ))}
        </ol>
      </section>
    );
    return (
      <div className="print-root">
        <PrintToolbar remakeHref={remakeHref} />
        {sheet(false)}
        {sheet(true)}
      </div>
    );
  }

  const items = buildKanjiSheet(level, count, seed);
  const mode = (child.furigana_mode as FuriganaMode) ?? "none";
  // 書きやすい大きさのマスを保つため、1ページ10問ずつに分ける
  const PER_PAGE = 10;
  const pages = Array.from({ length: Math.ceil(items.length / PER_PAGE) }, (_, i) => items.slice(i * PER_PAGE, (i + 1) * PER_PAGE));
  const sheet = (answer: boolean, pageItems: KanjiWriteItem[], pageNo: number) => (
    <section className="sheet" key={`${answer}-${pageNo}`}>
      <SheetHeader
        title="かんじ かきとり プリント"
        sub={`${level} ${levelName}${pages.length > 1 ? `（${pageNo + 1}/${pages.length}まい）` : ""}`}
        name={child.name}
        total={items.length}
        seed={seed}
        answer={answer}
      />
      <p className="sheet-howto">□に あう かんじを かきましょう。</p>
      <ol className="kanji-list" style={{ ["--row" as string]: "21mm", fontSize: "6.4mm" }}>
        {pageItems.map((it, i) => (
          <li key={i} className="kanji-item">
            <span className="item-no">({pageNo * PER_PAGE + i + 1})</span>
            <SentenceText segments={it.segments} mode={mode} item={it} answer={answer} />
          </li>
        ))}
      </ol>
    </section>
  );
  return (
    <div className="print-root">
      {/*
        答えの字は教科書体（Klee One）。読み込めないときは明朝体で表示する。
        precedence を付けると読み込み終わるまで画面が出ないので付けない
      */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Klee+One:wght@600&display=swap" />
      <PrintToolbar remakeHref={remakeHref} />
      {pages.map((p, i) => sheet(false, p, i))}
      {pages.map((p, i) => sheet(true, p, i))}
    </div>
  );
}
