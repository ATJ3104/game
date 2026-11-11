// LINE 通知の文面と、送るかどうかの判定（純粋関数）

export type SubjectStatus = "not_started" | "studying" | "retry" | "done";

export interface ChildToday {
  name: string;
  /** 今日の教科がすべて終わった */
  done: boolean;
  /** 今日は特別休み */
  special: boolean;
  subjects: { label: string; status: SubjectStatus }[];
}

const STATUS_TEXT: Record<SubjectStatus, string> = {
  not_started: "まだ",
  studying: "とちゅう",
  retry: "まちがいなおし中",
  done: "✅",
};

/** 日本時間の「時」 */
export function jstHour(now: Date): number {
  return (now.getUTCHours() + 9) % 24;
}

/** 日本時間の「時:分」 */
export function jstTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** まだ終わっていない子（特別休み・教科のない子は除く） */
export function pendingChildren(children: readonly ChildToday[]): ChildToday[] {
  return children.filter((c) => !c.done && !c.special && c.subjects.length > 0);
}

/** 決まった時刻のお知らせ。終わっていない子がいなければ null（送らない） */
export function reminderMessage(children: readonly ChildToday[], hour: number): string | null {
  const pending = pendingChildren(children);
  if (pending.length === 0) return null;
  const lines = pending.map(
    (c) => `・${c.name}：${c.subjects.map((s) => `${s.label} ${STATUS_TEXT[s.status]}`).join("／")}`,
  );
  return [`【まいにちドリル】${hour}時になりました。`, "きょうのドリルが まだ終わっていません。", ...lines].join("\n");
}

/** 1人が今日のドリルを終えたとき */
export function completeMessage(p: { name: string; completedAt: string; minutes: number; correct: number; total: number }): string {
  const rate = p.total > 0 ? `・正答率 ${Math.round((p.correct / p.total) * 100)}%` : "";
  return `【まいにちドリル】🎉 ${p.name}さんが きょうのドリルを ぜんぶ終えました（${jstTime(p.completedAt)}）\n学習 ${p.minutes}分${rate}`;
}

/** 全員が終えたとき（特別休みの子は数えない） */
export function allCompleteMessage(names: readonly string[]): string {
  return `【まいにちドリル】🎉 きょうは 全員 達成です！（${names.join("・")}）`;
}

/** 全員終わったか（特別休み・教科のない子は除いて、1人以上いること） */
export function allDone(children: readonly ChildToday[]): boolean {
  const target = children.filter((c) => !c.special && c.subjects.length > 0);
  return target.length > 0 && target.every((c) => c.done);
}

/**
 * LINE で送られてきた文から連携コード（6けた）を取り出す。全角数字・空白・ハイフンも受け付ける
 */
export function parseLinkCode(text: string): string | null {
  const half = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\s\-ー－]/g, "");
  return /^\d{6}$/.test(half) ? half : null;
}

export type CompleteMode = "each" | "all" | "off";

/** 1か月に送るメッセージ数の目安（LINE の無料プランは月200通） */
export function estimateMonthlyMessages(
  links: readonly { complete: CompleteMode; reminder: boolean }[],
  childCount: number,
  days = 30,
): number {
  let n = 0;
  for (const l of links) {
    if (l.complete === "each") n += childCount * days;
    if (l.complete === "all") n += days;
    // お知らせは「終わっていない子がいる日」だけ。多めに見て毎日とする
    if (l.reminder) n += days;
  }
  return n;
}
