import { describe, expect, it } from "vitest";
import { pickVoice } from "@/ui/speech";

const v = (name: string, lang: string, localService = true) => ({ name, lang, localService }) as SpeechSynthesisVoice;

describe("読み上げの声えらび", () => {
  it("言語が完全に一致し、端末内蔵の声を優先", () => {
    const voices = [v("GB", "en-GB"), v("US online", "en-US", false), v("US local", "en-US"), v("JP", "ja-JP")];
    expect(pickVoice(voices, "en-US")!.name).toBe("US local");
    expect(pickVoice(voices, "ja-JP")!.name).toBe("JP");
  });
  it("完全一致がなければ同じ言語のほかの地域の声", () => {
    expect(pickVoice([v("GB", "en-GB"), v("JP", "ja-JP")], "en-US")!.name).toBe("GB");
    expect(pickVoice([v("AU", "en_AU")], "en-US")!.name).toBe("AU");
  });
  it("その言語の声がなければ undefined", () => {
    expect(pickVoice([v("JP", "ja-JP")], "en-US")).toBeUndefined();
    expect(pickVoice([], "ja-JP")).toBeUndefined();
  });
});
