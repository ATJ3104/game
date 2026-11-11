import { describe, expect, it } from "vitest";
import {
  allCompleteMessage,
  allDone,
  completeMessage,
  estimateMonthlyMessages,
  jstHour,
  jstTime,
  parseLinkCode,
  pendingChildren,
  reminderMessage,
  type ChildToday,
} from "@/domain/notify";
import { verifyLineSignature } from "@/server/lineApi";

const kid = (name: string, done: boolean, statuses: ChildToday["subjects"][number]["status"][], special = false): ChildToday => ({
  name,
  done,
  special,
  subjects: statuses.map((status, i) => ({ label: ["さんすう", "こくご", "えいご"][i]!, status })),
});

describe("お知らせ（決まった時刻）", () => {
  it("終わっていない子だけ、教科ごとの様子つきで知らせる", () => {
    const text = reminderMessage(
      [kid("たろう", true, ["done", "done"]), kid("はなこ", false, ["done", "studying", "not_started"]), kid("けん", false, ["not_started"])],
      22,
    )!;
    expect(text).toContain("22時になりました");
    expect(text).not.toContain("たろう");
    expect(text).toContain("・はなこ：さんすう ✅／こくご とちゅう／えいご まだ");
    expect(text).toContain("・けん：さんすう まだ");
  });
  it("全員終わっている・特別休み・教科のない子だけなら送らない", () => {
    expect(reminderMessage([kid("たろう", true, ["done"])], 22)).toBeNull();
    expect(reminderMessage([kid("はなこ", false, ["not_started"], true)], 22)).toBeNull();
    expect(reminderMessage([kid("けん", false, [])], 22)).toBeNull();
    expect(pendingChildren([kid("a", false, ["retry"])]).map((c) => c.name)).toEqual(["a"]);
  });
  it("全員達成の判定は、特別休みの子を除く", () => {
    expect(allDone([kid("a", true, ["done"]), kid("b", false, ["not_started"], true)])).toBe(true);
    expect(allDone([kid("a", true, ["done"]), kid("b", false, ["studying"])])).toBe(false);
    expect(allDone([kid("b", false, ["studying"], true)])).toBe(false); // 対象が0人
  });
});

describe("完了の通知", () => {
  it("名前・時刻（日本時間）・学習時間・正答率", () => {
    const t = completeMessage({ name: "たろう", completedAt: "2026-11-11T10:42:00Z", minutes: 31, correct: 18, total: 20 });
    expect(t).toContain("たろうさんが きょうのドリルを ぜんぶ終えました（19:42）");
    expect(t).toContain("学習 31分・正答率 90%");
    expect(completeMessage({ name: "a", completedAt: "2026-11-11T10:42:00Z", minutes: 5, correct: 0, total: 0 })).not.toContain("正答率");
    expect(allCompleteMessage(["たろう", "はなこ"])).toContain("全員 達成です！（たろう・はなこ）");
  });
  it("日本時間の時・時刻", () => {
    expect(jstHour(new Date("2026-11-11T13:00:00Z"))).toBe(22);
    expect(jstHour(new Date("2026-11-11T15:30:00Z"))).toBe(0);
    expect(jstTime("2026-11-11T13:05:00Z")).toBe("22:05");
  });
});

describe("LINE の連携コード", () => {
  it("6けたの数字（全角・空白・ハイフンも可）", () => {
    expect(parseLinkCode("123456")).toBe("123456");
    expect(parseLinkCode(" １２３ ４５６ ")).toBe("123456");
    expect(parseLinkCode("123-456")).toBe("123456");
    expect(parseLinkCode("12345")).toBeNull();
    expect(parseLinkCode("こんにちは")).toBeNull();
  });
});

describe("通数のめやす", () => {
  it("1人ずつ通知は子ども×30、全員のときは30、お知らせは30", () => {
    expect(estimateMonthlyMessages([{ complete: "each", reminder: true }], 3)).toBe(120);
    expect(estimateMonthlyMessages([{ complete: "each", reminder: true }, { complete: "all", reminder: true }], 3)).toBe(180);
    expect(estimateMonthlyMessages([{ complete: "off", reminder: false }], 3)).toBe(0);
  });
});

describe("LINE の Webhook の署名", () => {
  it("チャネルシークレットでの HMAC-SHA256（Base64）と一致するものだけ通す", async () => {
    const body = '{"events":[]}';
    // node の crypto で作った正しい署名
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", "secret123").update(body).digest("base64");
    expect(await verifyLineSignature("secret123", body, sig)).toBe(true);
    expect(await verifyLineSignature("secret123", body + " ", sig)).toBe(false);
    expect(await verifyLineSignature("other", body, sig)).toBe(false);
    expect(await verifyLineSignature("secret123", body, null)).toBe(false);
    expect(await verifyLineSignature("", body, sig)).toBe(false);
  });
});
