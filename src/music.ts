// ================================================================
// BGM(音楽ファイルなしで、Web Audio APIのチップチューン合成)
// 16分音符のグリッドに音をならべた「楽譜データ」をループ再生する。
// メロディ=矩形波 / ベース=三角波 / ドラム=ノイズ。
// 効果音のじゃまをしないよう、音量はひかえめにしてある。
// Mキーでミュートできる(main.tsで割り当て)。
// ================================================================

import type { Sfx } from './audio';

export type TrackName = 'menu' | 'battle';

/** MIDIノート番号 → 周波数(69=A4=440Hz) */
function nf(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** ベース1小節分(ルート音から作る: ルート・5度・オクターブの動き) */
function bassBar(root: number): number[] {
  return [root, 0, root + 7, 0, root, 0, root + 7, 0, root, 0, root + 7, 0, root, 0, root + 12, 0];
}

/** 走るようなベース1小節分(バトル用・8分きざみ) */
function driveBar(root: number): number[] {
  return [root, 0, root, 0, root + 7, 0, root, 0, root, 0, root + 10, 0, root + 7, 0, root, 0];
}

interface Song {
  bpm: number;
  melody: number[]; // 16分音符ごとのノート番号(0=休符)
  bass: number[];
  drums: boolean; // ハイハット・スネアを入れるか
  melVol: number;
}

// ---- 楽譜データ(ここを書きかえると曲が変わる) ----
const SONGS: Record<TrackName, Song> = {
  // タイトル・メニュー: ゆったり勇者っぽい C→Am→F→G
  menu: {
    bpm: 108,
    melVol: 0.042,
    drums: false,
    bass: [...bassBar(48), ...bassBar(45), ...bassBar(41), ...bassBar(43)],
    melody: [
      72, 0, 0, 0, 76, 0, 0, 0, 79, 0, 76, 0, 72, 0, 0, 0,
      69, 0, 0, 0, 72, 0, 0, 0, 76, 0, 72, 0, 69, 0, 0, 0,
      65, 0, 69, 0, 72, 0, 0, 0, 77, 0, 76, 0, 72, 0, 69, 0,
      67, 0, 71, 0, 74, 0, 0, 0, 79, 0, 0, 0, 74, 0, 71, 0,
    ],
  },
  // バトル: 疾走感のある Am→Am→F→G
  battle: {
    bpm: 158,
    melVol: 0.04,
    drums: true,
    bass: [...driveBar(45), ...driveBar(45), ...driveBar(41), ...driveBar(43)],
    melody: [
      69, 0, 72, 74, 76, 0, 74, 72, 69, 0, 72, 0, 74, 72, 69, 0,
      69, 0, 72, 74, 76, 0, 79, 76, 81, 0, 79, 76, 74, 0, 72, 0,
      77, 0, 76, 74, 72, 0, 74, 76, 77, 0, 76, 74, 72, 0, 69, 0,
      79, 0, 76, 0, 74, 0, 76, 0, 79, 0, 81, 0, 83, 0, 79, 0,
    ],
  },
};

export class Music {
  /** いま流している曲(デバッグ・表示用) */
  current: TrackName | null = null;
  muted = false;
  private step = 0;
  private nextTime = 0;

  constructor(private sfx: Sfx) {
    // 先読みスケジューラ: 少し先の音を予約しつづける
    setInterval(() => this.tick(), 80);
  }

  /** 曲を切りかえる(同じ曲なら何もしない) */
  play(name: TrackName): void {
    if (this.current === name) return;
    this.current = name;
    this.step = 0;
    this.nextTime = 0;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private tick(): void {
    const ac = this.sfx.getCtx();
    if (!ac || !this.current || this.muted) {
      this.nextTime = 0; // 再開したら「いま」から鳴らす
      return;
    }
    const song = SONGS[this.current];
    const spd = 60 / song.bpm / 4; // 16分音符1つの長さ(秒)
    if (this.nextTime < ac.currentTime + 0.05) this.nextTime = ac.currentTime + 0.08;
    while (this.nextTime < ac.currentTime + 0.3) {
      this.scheduleStep(ac, song, this.nextTime, spd);
      this.step++;
      this.nextTime += spd;
    }
  }

  /** 1音ならす(発音時刻・長さ・波形・音量つき) */
  private note(ac: AudioContext, freq: number, t: number, dur: number, type: OscillatorType, vol: number): void {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /** ノイズ打楽器(ハイハット・スネア) */
  private drum(ac: AudioContext, t: number, dur: number, vol: number, freq: number): void {
    const buf = this.sfx.getNoise();
    if (!buf) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = freq;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private scheduleStep(ac: AudioContext, song: Song, t: number, spd: number): void {
    const i = this.step % song.melody.length;
    const mel = song.melody[i];
    if (mel > 0) this.note(ac, nf(mel), t, spd * 1.9, 'square', song.melVol);
    const bass = song.bass[i % song.bass.length];
    if (bass > 0) this.note(ac, nf(bass - 12), t, spd * 1.6, 'triangle', 0.065);
    if (song.drums) {
      if (i % 2 === 0) this.drum(ac, t, 0.03, 0.012, 6000); // ハイハット
      if (i % 16 === 4 || i % 16 === 12) this.drum(ac, t, 0.09, 0.03, 1500); // スネア
    }
  }
}
