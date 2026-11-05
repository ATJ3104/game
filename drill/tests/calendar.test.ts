import { describe, expect, it } from "vitest";
import {
  computeMonth,
  computeStreak,
  finalResultOf,
  finishedMonthsSince,
  type MonthInput,
} from "@/domain/calendar";
import {
  addDays,
  addMonths,
  dateRange,
  daysInMonth,
  diffDays,
  isValidDate,
  monthDates,
  studyDateOf,
  studyDayStart,
  weekdayOf,
} from "@/domain/dates";

/** 日本時間の時刻を UTC の Date に（テストを読みやすくするため） */
const jst = (s: string) => new Date(`${s}+09:00`);

/** 月の全日（または指定範囲）を達成済みにするヘルパー */
const all = (ym: string) => new Set(monthDates(ym));
const without = (set: Set<string>, ...dates: string[]) => {
  const s = new Set(set);
  for (const d of dates) s.delete(d);
  return s;
};

function month(partial: Partial<MonthInput> & { yearMonth: string }): ReturnType<typeof computeMonth> {
  return computeMonth({
    today: "2099-01-01",
    startDate: "2000-01-01",
    completed: new Set(),
    special: new Set(),
    ticketsPerMonth: 5,
    ...partial,
  });
}

describe("日の区切り（日本時間 3:00）", () => {
  it("2:59 の学習は前日扱い、3:00 からは当日", () => {
    expect(studyDateOf(jst("2026-11-05T02:59:59"))).toBe("2026-11-04");
    expect(studyDateOf(jst("2026-11-05T03:00:00"))).toBe("2026-11-05");
    expect(studyDateOf(jst("2026-11-05T23:59:59"))).toBe("2026-11-05");
    expect(studyDateOf(jst("2026-11-06T00:30:00"))).toBe("2026-11-05");
  });
  it("月またぎ・年またぎでも前日扱いになる", () => {
    expect(studyDateOf(jst("2026-12-01T02:00:00"))).toBe("2026-11-30");
    expect(studyDateOf(jst("2027-01-01T02:59:00"))).toBe("2026-12-31");
    expect(studyDateOf(jst("2028-03-01T01:00:00"))).toBe("2028-02-29"); // うるう年
    expect(studyDateOf(jst("2027-03-01T01:00:00"))).toBe("2027-02-28");
  });
  it("UTC で見ると日付が違っても日本時間で判定する", () => {
    // UTC 2026-11-04T18:30 = JST 11/5 3:30
    expect(studyDateOf(new Date("2026-11-04T18:30:00Z"))).toBe("2026-11-05");
    // UTC 2026-11-04T17:59 = JST 11/5 2:59
    expect(studyDateOf(new Date("2026-11-04T17:59:00Z"))).toBe("2026-11-04");
  });
  it("区切り時刻は設定で変えられる（0時・5時）", () => {
    expect(studyDateOf(jst("2026-11-05T00:00:00"), 0)).toBe("2026-11-05");
    expect(studyDateOf(jst("2026-11-04T23:59:59"), 0)).toBe("2026-11-04");
    expect(studyDateOf(jst("2026-11-05T04:59:00"), 5)).toBe("2026-11-04");
    expect(studyDateOf(jst("2026-11-05T05:00:00"), 5)).toBe("2026-11-05");
  });
  it("学習日の始まりの時刻", () => {
    expect(studyDayStart("2026-11-05").toISOString()).toBe(jst("2026-11-05T03:00:00").toISOString());
    expect(studyDateOf(studyDayStart("2026-11-05"))).toBe("2026-11-05");
    expect(studyDateOf(new Date(studyDayStart("2026-11-05").getTime() - 1))).toBe("2026-11-04");
  });
});

describe("日付の計算", () => {
  it("月の日数（28・29・30・31日）", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-01")).toBe(31);
    expect(daysInMonth("2026-12")).toBe(31);
    expect(monthDates("2026-02")).toHaveLength(28);
    expect(monthDates("2026-02")[27]).toBe("2026-02-28");
  });
  it("日付の加算・差・範囲・月の加算・曜日・妥当性", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-01-01", "2026-12-31")).toBe(364);
    expect(dateRange("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(dateRange("2026-03-02", "2026-03-01")).toEqual([]);
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(weekdayOf("2026-11-05")).toBe(4); // 木曜
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("abc")).toBe(false);
  });
});

describe("月の判定：お休み券", () => {
  for (const ym of ["2026-02", "2026-04", "2026-01"]) {
    const n = daysInMonth(ym);
    describe(`${ym}（${n}日の月）`, () => {
      it("全部やれば達成、お休み券は5枚残る", () => {
        const s = month({ yearMonth: ym, completed: all(ym) });
        expect(s.result).toBe("achieved");
        expect(s.ticketsLeft).toBe(5);
        expect(s.achievedDays).toBe(n);
        expect(s.days).toHaveLength(n);
      });
      it("やらなかった日が5日ちょうど → お休み券5枚で達成", () => {
        const skip = [1, 3, 10, 20, n].map((d) => `${ym}-${String(d).padStart(2, "0")}`);
        const s = month({ yearMonth: ym, completed: without(all(ym), ...skip) });
        expect(s.ticketsUsed).toBe(5);
        expect(s.ticketsLeft).toBe(0);
        expect(s.missedCount).toBe(0);
        expect(s.result).toBe("achieved");
        expect(s.days.filter((d) => d.status === "ticket").map((d) => d.date)).toEqual(skip);
        // 最終日（月末）が5枚目
        expect(s.days[n - 1]).toEqual({ date: `${ym}-${String(n).padStart(2, "0")}`, status: "ticket", ticketNo: 5 });
      });
      it("6日目の未実施で「未達成」になり、達成ならず", () => {
        const skip = [1, 2, 3, 4, 5, n].map((d) => `${ym}-${String(d).padStart(2, "0")}`);
        const s = month({ yearMonth: ym, completed: without(all(ym), ...skip) });
        expect(s.ticketsUsed).toBe(5);
        expect(s.missedCount).toBe(1);
        expect(s.noStudyDays).toBe(6);
        expect(s.result).toBe("failed");
        expect(s.days[n - 1]!.status).toBe("missed");
        expect(s.days.slice(0, 5).map((d) => d.ticketNo)).toEqual([1, 2, 3, 4, 5]);
      });
    });
  }

  it("お休み券は連続で使ってよい（1〜5日連続で達成）", () => {
    const ym = "2026-04";
    const s = month({ yearMonth: ym, completed: without(all(ym), ...dateRange("2026-04-10", "2026-04-14")) });
    expect(s.result).toBe("achieved");
    expect(s.ticketsUsed).toBe(5);
  });

  it("未達成の日が出た時点で、月の途中でも「達成ならず」が確定", () => {
    const s = month({
      yearMonth: "2026-11",
      today: "2026-11-10",
      completed: new Set(["2026-11-07", "2026-11-08", "2026-11-09"]),
    });
    // 1〜6日の6日間やっていない → 6日目が未達成
    expect(s.days[5]!.status).toBe("missed");
    expect(s.result).toBe("failed");
    expect(s.finished).toBe(false);
  });

  it("月の途中：今日はまだ判定しない（お休み券を使わない）・未来は判定しない", () => {
    const s = month({
      yearMonth: "2026-11",
      today: "2026-11-05",
      completed: new Set(["2026-11-01", "2026-11-02", "2026-11-03"]),
    });
    expect(s.days[3]).toEqual({ date: "2026-11-04", status: "ticket", ticketNo: 1 });
    expect(s.days[4]!.status).toBe("today");
    expect(s.days[5]!.status).toBe("future");
    expect(s.ticketsLeft).toBe(4);
    expect(s.result).toBe("in_progress");
    expect(finalResultOf(s)).toBeNull();
  });

  it("今日やり終えたら、今日は「達成」", () => {
    const s = month({ yearMonth: "2026-11", today: "2026-11-05", completed: new Set(["2026-11-05"]) });
    expect(s.days[4]!.status).toBe("achieved");
  });

  it("利用開始より前の日は対象外（お休み券を使わない）", () => {
    const s = month({
      yearMonth: "2026-11",
      today: "2026-11-30",
      startDate: "2026-11-20",
      completed: new Set(dateRange("2026-11-20", "2026-11-29")),
    });
    expect(s.days[18]!.status).toBe("out_of_range");
    expect(s.days[19]!.status).toBe("achieved");
    expect(s.ticketsUsed).toBe(0);
  });

  it("利用開始前の月・未来の月は判定なし", () => {
    expect(month({ yearMonth: "2026-10", today: "2026-11-05", startDate: "2026-11-01" }).result).toBe("not_applicable");
    expect(month({ yearMonth: "2026-12", today: "2026-11-05" }).result).toBe("not_applicable");
  });

  it("月が終わったら結果を確定できる", () => {
    const ym = "2026-02";
    const s = month({ yearMonth: ym, today: "2026-03-01", completed: without(all(ym), "2026-02-10") });
    expect(s.finished).toBe(true);
    expect(finalResultOf(s)).toEqual({ achieved: true, missedDays: 1, specialDaysCount: 0 });
  });
});

describe("月の判定：特別休み", () => {
  const ym = "2026-04"; // 30日

  it("特別休みの日はお休み券を減らさない", () => {
    const s = month({
      yearMonth: ym,
      completed: without(all(ym), "2026-04-01", "2026-04-02", "2026-04-03"),
      special: new Set(["2026-04-02"]),
    });
    expect(s.days[1]!.status).toBe("special");
    expect(s.ticketsUsed).toBe(2);
    expect(s.specialDays).toBe(1);
  });

  it("特別休みは判定の対象外：やらなかった日が8日でも、3日が特別休みなら達成", () => {
    const skip = dateRange("2026-04-01", "2026-04-08");
    const s = month({
      yearMonth: ym,
      completed: without(all(ym), ...skip),
      special: new Set(["2026-04-02", "2026-04-04", "2026-04-06"]),
    });
    expect(s.ticketsUsed).toBe(5);
    expect(s.missedCount).toBe(0);
    expect(s.result).toBe("achieved");
    expect(finalResultOf({ ...s, finished: true })).toEqual({ achieved: true, missedDays: 5, specialDaysCount: 3 });
  });

  it("特別休みの日にやった場合は「達成」と表示（判定には影響しない）", () => {
    const s = month({ yearMonth: ym, completed: all(ym), special: new Set(["2026-04-02"]) });
    expect(s.days[1]!.status).toBe("achieved");
    expect(s.result).toBe("achieved");
  });

  it("月の大半が特別休みでも、残りの日だけで判定する", () => {
    const special = new Set(dateRange("2026-04-01", "2026-04-28"));
    const s = month({ yearMonth: ym, completed: new Set(), special });
    expect(s.ticketsUsed).toBe(2);
    expect(s.result).toBe("achieved");
  });

  describe("過去日にさかのぼって設定・取り消し（記録から毎回計算し直す）", () => {
    // 4/1〜4/6 の6日間かぜで休み、他は全部やった。今日は 4/8
    const completed = without(all(ym), ...dateRange("2026-04-01", "2026-04-06"));
    const base = { yearMonth: ym, today: "2026-04-08", completed };

    it("登録前：6日目が未達成で、達成ならず", () => {
      const s = month({ ...base, special: new Set() });
      expect(s.days[5]!.status).toBe("missed");
      expect(s.result).toBe("failed");
    });

    it("翌々日に4/1〜4/6 を特別休みとしてさかのぼって登録 → 未達成もお休み券も消える", () => {
      const s = month({ ...base, special: new Set(dateRange("2026-04-01", "2026-04-06")) });
      expect(s.days.slice(0, 6).every((d) => d.status === "special")).toBe(true);
      expect(s.ticketsUsed).toBe(0);
      expect(s.result).toBe("in_progress");
    });

    it("1日だけ登録 → その日が外れて、残り5日がお休み券1〜5枚目に振り直される", () => {
      const s = month({ ...base, special: new Set(["2026-04-03"]) });
      expect(s.days.map((d) => d.ticketNo ?? null).slice(0, 6)).toEqual([1, 2, null, 3, 4, 5]);
      expect(s.missedCount).toBe(0);
      expect(s.result).toBe("in_progress");
    });

    it("登録を取り消すと、元の判定（達成ならず）に戻る", () => {
      const withSpecial = month({ ...base, special: new Set(["2026-04-03"]) });
      expect(withSpecial.result).toBe("in_progress");
      const cancelled = month({ ...base, special: new Set() });
      expect(cancelled.result).toBe("failed");
      expect(cancelled.days[5]!.status).toBe("missed");
    });

    it("確定済みの過去の月も、特別休みの変更後に計算し直せる", () => {
      const ym2 = "2026-02";
      const comp = without(all(ym2), ...dateRange("2026-02-20", "2026-02-25"));
      const before = finalResultOf(month({ yearMonth: ym2, today: "2026-03-05", completed: comp }));
      expect(before).toEqual({ achieved: false, missedDays: 6, specialDaysCount: 0 });
      const after = finalResultOf(
        month({ yearMonth: ym2, today: "2026-03-05", completed: comp, special: new Set(["2026-02-22"]) }),
      );
      expect(after).toEqual({ achieved: true, missedDays: 5, specialDaysCount: 1 });
    });
  });
});

describe("連続日数", () => {
  const base = { startDate: "2026-01-01", ticketsPerMonth: 5, special: new Set<string>() };

  it("毎日やれば日数ぶん続く、今日まだでも途切れない", () => {
    const completed = new Set(dateRange("2026-11-01", "2026-11-04"));
    expect(computeStreak({ ...base, today: "2026-11-05", startDate: "2026-11-01", completed })).toBe(4);
    completed.add("2026-11-05");
    expect(computeStreak({ ...base, today: "2026-11-05", startDate: "2026-11-01", completed })).toBe(5);
  });

  it("お休み券の日では途切れない", () => {
    const completed = new Set([...dateRange("2026-11-01", "2026-11-02"), ...dateRange("2026-11-04", "2026-11-05")]);
    expect(computeStreak({ ...base, today: "2026-11-05", startDate: "2026-11-01", completed })).toBe(4);
  });

  it("特別休みの日では途切れない（お休み券が尽きていても）", () => {
    // 11/1〜11/5 はお休み券、11/6〜11/9 特別休み、11/10〜 達成
    const completed = new Set(dateRange("2026-11-10", "2026-11-12"));
    const special = new Set(dateRange("2026-11-06", "2026-11-09"));
    expect(
      computeStreak({ ...base, today: "2026-11-12", startDate: "2026-10-31", completed: new Set([...completed, "2026-10-31"]), special }),
    ).toBe(4);
  });

  it("未達成の日で途切れる", () => {
    // 11/1〜11/6 やらない（6日目が未達成）、11/7〜11/9 達成
    const completed = new Set(["2026-10-30", "2026-10-31", ...dateRange("2026-11-07", "2026-11-09")]);
    expect(computeStreak({ ...base, today: "2026-11-09", startDate: "2026-10-01", completed })).toBe(3);
  });

  it("月をまたいでもつながる（お休み券は月ごとにリセット）", () => {
    // 10月は25〜31日のうち 29 をお休み券、11月は 1 をお休み券
    const completed = new Set([...dateRange("2026-10-25", "2026-10-31"), ...dateRange("2026-11-02", "2026-11-03")]);
    completed.delete("2026-10-29");
    expect(computeStreak({ ...base, today: "2026-11-03", startDate: "2026-10-25", completed })).toBe(8);
  });

  it("特別休みをさかのぼって設定すると、途切れていた連続がつながる", () => {
    const completed = new Set([...dateRange("2026-04-07", "2026-04-10")]);
    const start = "2026-03-31";
    completed.add("2026-03-31");
    const before = computeStreak({ ...base, today: "2026-04-10", startDate: start, completed });
    expect(before).toBe(4); // 4/6 が未達成で途切れる
    const after = computeStreak({
      ...base,
      today: "2026-04-10",
      startDate: start,
      completed,
      special: new Set(["2026-04-03"]),
    });
    expect(after).toBe(5); // 3/31 までつながる
  });

  it("何もしていなければ 0", () => {
    expect(computeStreak({ ...base, today: "2026-11-05", completed: new Set() })).toBe(0);
  });
});

describe("確定保存の対象月", () => {
  it("利用開始月から先月まで", () => {
    expect(finishedMonthsSince("2026-09-15", "2026-11-05")).toEqual(["2026-09", "2026-10"]);
    expect(finishedMonthsSince("2026-11-01", "2026-11-05")).toEqual([]);
    expect(finishedMonthsSince("2026-12-20", "2027-01-01")).toEqual(["2026-12"]);
  });
});
