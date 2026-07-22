// ================================================================
// BGM(音楽ファイルなしで、Web Audio APIのチップチューン合成)
// 16分音符のグリッドに音をならべた「楽譜データ」をループ再生する。
//
// 音作り(カッコよさのポイント):
//  - リード: 矩形波+ノコギリ波をわずかにずらして重ねた太い音 + エコー
//  - ベース: 三角波 + 1オクターブ下のサイン波(重低音)
//  - ドラム: キック(ピッチが落ちるサイン波)/スネア/ハイハット
//  - 全体をコンプレッサーでまとめて迫力を出す
// Mキーでミュートできる(main.tsで割り当て)。
// ================================================================

import type { Sfx } from './audio';

export type TrackName = 'menu' | 'battle';

/** MIDIノート番号 → 周波数(69=A4=440Hz) */
function nf(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** アルペジオ1小節分(コードのルート音から root→5度→オクターブ→5度 をきざむ) */
function arpBar(root: number): number[] {
  const p = [root, root + 7, root + 12, root + 7];
  return [...p, ...p, ...p, ...p];
}

/** ギャロップベース1小節分(バトル用: タタタッというきざみ+オクターブ跳び) */
function gallopBar(r: number): number[] {
  return [r, r, r + 12, r, r, r, r + 12, r, r, r, r + 12, r, r + 10, 0, r + 7, 0];
}

/** 8分きざみのベース1小節分(メニュー用: 落ちついた鼓動) */
function pulseBar(r: number): number[] {
  return [r, 0, r, 0, r + 12, 0, r, 0, r, 0, r + 7, 0, r + 12, 0, r, 0];
}

interface Song {
  bpm: number;
  lead: number[]; // 16分音符ごとのノート番号(0=休符)
  bass: number[];
  arp: number[]; // うしろで小さく鳴るアルペジオ
  kick: number[]; // 1小節(16ステップ)ぶんのドラムパターン(1=鳴らす)
  snare: number[];
  hat: number[];
  leadVol: number;
  delayFeel: number; // エコーの長さ(拍に対する倍率)
}

// ---- 楽譜データ(ここを書きかえると曲が変わる) ----
const SONGS: Record<TrackName, Song> = {
  // メニュー: Dマイナーのシネマティック風(Dm→B♭→F→C を2周+変化)
  menu: {
    bpm: 120,
    leadVol: 0.034,
    delayFeel: 0.75, // 付点8分のエコーで広がりを出す
    bass: [
      ...pulseBar(38), ...pulseBar(34), ...pulseBar(29), ...pulseBar(31),
      ...pulseBar(38), ...pulseBar(34), ...pulseBar(29), ...pulseBar(31),
    ],
    arp: [
      ...arpBar(62), ...arpBar(58), ...arpBar(53), ...arpBar(55),
      ...arpBar(62), ...arpBar(58), ...arpBar(53), ...arpBar(55),
    ],
    lead: [
      // 前半: 静かに立ちあがるメロディ
      74, 0, 0, 0, 77, 0, 81, 0, 0, 0, 77, 0, 74, 0, 0, 0,
      70, 0, 0, 0, 74, 0, 77, 0, 0, 0, 74, 0, 70, 0, 0, 0,
      65, 0, 69, 0, 72, 0, 77, 0, 0, 0, 76, 0, 72, 0, 0, 0,
      67, 0, 72, 0, 76, 0, 79, 0, 0, 0, 76, 0, 72, 0, 67, 0,
      // 後半: 高音で盛りあがって着地
      86, 0, 0, 0, 84, 0, 81, 0, 0, 0, 84, 0, 86, 0, 0, 0,
      82, 0, 0, 0, 81, 0, 77, 0, 0, 0, 81, 0, 82, 0, 0, 0,
      84, 0, 81, 0, 77, 0, 72, 0, 76, 0, 77, 0, 81, 0, 84, 0,
      79, 0, 76, 0, 74, 0, 72, 0, 74, 0, 0, 0, 0, 0, 0, 0,
    ],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  },
  // バトル: Eマイナーの疾走メタル風(Em→Em→C→D / Em→Em→C→B)
  battle: {
    bpm: 172,
    leadVol: 0.038,
    delayFeel: 0.5, // 8分のタイトなエコー
    bass: [
      ...gallopBar(40), ...gallopBar(40), ...gallopBar(36), ...gallopBar(38),
      ...gallopBar(40), ...gallopBar(40), ...gallopBar(36), ...gallopBar(35),
    ],
    arp: [
      ...arpBar(64), ...arpBar(64), ...arpBar(60), ...arpBar(62),
      ...arpBar(64), ...arpBar(64), ...arpBar(60), ...arpBar(59),
    ],
    lead: [
      // 前半リフ
      76, 0, 76, 0, 0, 0, 79, 0, 76, 0, 74, 0, 76, 0, 0, 0,
      0, 0, 74, 76, 79, 0, 81, 0, 79, 0, 76, 0, 74, 0, 76, 0,
      72, 0, 0, 72, 76, 0, 72, 0, 79, 0, 76, 0, 72, 0, 0, 0,
      74, 0, 0, 74, 78, 0, 74, 0, 81, 0, 78, 0, 74, 0, 76, 0,
      // 後半: 高音ソロっぽく駆けあがる
      76, 0, 76, 0, 0, 0, 79, 0, 83, 0, 81, 0, 79, 0, 76, 0,
      81, 0, 79, 0, 76, 0, 74, 0, 76, 0, 79, 0, 81, 0, 83, 0,
      84, 0, 0, 83, 81, 0, 79, 0, 81, 0, 79, 0, 76, 0, 74, 0,
      74, 0, 71, 0, 74, 0, 76, 0, 79, 0, 78, 0, 74, 0, 71, 0,
    ],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
  },
};

/** 音をまとめて出力するバス(コンプレッサー+エコー) */
interface Bus {
  master: GainNode;
  delay: DelayNode;
  delaySend: GainNode;
}

export class Music {
  /** いま流している曲(デバッグ・表示用) */
  current: TrackName | null = null;
  muted = false;
  private step = 0;
  private nextTime = 0;
  private bus: Bus | null = null;
  private busCtx: AudioContext | null = null;

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

  /** コンプレッサー+エコーの出力バスを用意する(1回だけ) */
  private getBus(ac: AudioContext): Bus {
    if (this.bus && this.busCtx === ac) return this.bus;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.ratio.value = 8;
    comp.connect(ac.destination);
    const master = ac.createGain();
    master.gain.value = 1;
    master.connect(comp);
    // エコー(フィードバックディレイ)
    const delay = ac.createDelay(1.0);
    const fb = ac.createGain();
    fb.gain.value = 0.32;
    const wet = ac.createGain();
    wet.gain.value = 0.4;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(comp);
    const delaySend = ac.createGain();
    delaySend.gain.value = 1;
    delaySend.connect(delay);
    this.bus = { master, delay, delaySend };
    this.busCtx = ac;
    return this.bus;
  }

  private tick(): void {
    const ac = this.sfx.getCtx();
    if (!ac || !this.current || this.muted) {
      this.nextTime = 0; // 再開したら「いま」から鳴らす
      return;
    }
    const song = SONGS[this.current];
    const bus = this.getBus(ac);
    const beat = 60 / song.bpm;
    bus.delay.delayTime.value = beat * song.delayFeel;
    const spd = beat / 4; // 16分音符1つの長さ(秒)
    if (this.nextTime < ac.currentTime + 0.05) this.nextTime = ac.currentTime + 0.08;
    while (this.nextTime < ac.currentTime + 0.3) {
      this.scheduleStep(ac, bus, song, this.nextTime, spd);
      this.step++;
      this.nextTime += spd;
    }
  }

  /** リード音: 2つのオシレータを重ねた太い音+エコー送り */
  private lead(ac: AudioContext, bus: Bus, freq: number, t: number, dur: number, vol: number): void {
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.012);
    gain.gain.setValueAtTime(vol, t + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    gain.connect(lp);
    lp.connect(bus.master);
    // エコーにも少し送る(音に広がりが出る)
    const send = ac.createGain();
    send.gain.value = 0.5;
    lp.connect(send).connect(bus.delaySend);
    for (const [type, det] of [['square', 0], ['sawtooth', 7]] as [OscillatorType, number][]) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = det;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  /** ベース音: 三角波+1オクターブ下のサイン波(サブベース) */
  private bassNote(ac: AudioContext, bus: Bus, freq: number, t: number, dur: number): void {
    const mk = (type: OscillatorType, f: number, vol: number): void => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(bus.master);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    };
    mk('triangle', freq, 0.055);
    mk('sine', freq / 2, 0.04); // 重低音
  }

  /** キック: ピッチが一気に落ちるサイン波(ドンッ) */
  private kick(ac: AudioContext, bus: Bus, t: number): void {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.1);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(gain).connect(bus.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  /** ノイズ打楽器(ハイハット・スネア) */
  private drum(ac: AudioContext, bus: Bus, t: number, dur: number, vol: number, freq: number): void {
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
    src.connect(filter).connect(gain).connect(bus.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private scheduleStep(ac: AudioContext, bus: Bus, song: Song, t: number, spd: number): void {
    const i = this.step % song.lead.length;
    const bar = i % 16;
    const mel = song.lead[i];
    if (mel > 0) this.lead(ac, bus, nf(mel), t, spd * 1.9, song.leadVol);
    const bass = song.bass[i % song.bass.length];
    if (bass > 0) this.bassNote(ac, bus, nf(bass - 12), t, spd * 1.3);
    const arp = song.arp[i % song.arp.length];
    if (arp > 0) {
      // うしろで小さくきざむアルペジオ(音に厚みを出す)
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = nf(arp);
      gain.gain.setValueAtTime(0.014, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + spd * 0.9);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      osc.connect(gain).connect(lp).connect(bus.master);
      osc.start(t);
      osc.stop(t + spd);
    }
    // ドラム(1小節=16ステップのパターンをくりかえす)
    if (song.kick[bar]) this.kick(ac, bus, t);
    if (song.snare[bar]) this.drum(ac, bus, t, 0.1, 0.05, 1400);
    if (song.hat[bar]) this.drum(ac, bus, t, 0.03, bar % 4 === 2 ? 0.018 : 0.011, 6500);
  }
}
