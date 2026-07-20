// ================================================================
// セーブデータ(localStorage)
// えらんだCPUの強さや、チュートリアルをクリアしたかを保存する。
// プライベートブラウズ等で使えない環境でも落ちないように
// try/catchで守っている。
// ================================================================

const KEY = 'robo-fighter-save-v1';

export interface SaveData {
  difficulty?: 0 | 1 | 2; // えらんだCPUの強さ
  tutorialDone?: boolean; // チュートリアルをクリアしたか
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as SaveData;
    return typeof data === 'object' && data !== null ? data : {};
  } catch {
    return {};
  }
}

/** 一部だけ書きかえて保存する */
export function patchSave(patch: Partial<SaveData>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadSave(), ...patch }));
  } catch {
    // 保存できない環境では何もしない(ゲームは動く)
  }
}
