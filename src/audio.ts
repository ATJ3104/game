// ================================================================
// サウンド(Web Audio APIで効果音を合成する)
// 音声ファイルは使わず、オシレーター(電子音)とノイズを組み合わせて
// レトロゲーム風の効果音をその場で作っている。
// スマホは自動再生が禁止されているので、最初のタップ/キーで unlock() を
// 呼んで AudioContext を resume する。
// ================================================================

export class Sfx {
  private ac: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;

  /** BGM側から使う: 再生できる状態のAudioContextを返す */
  getCtx(): AudioContext | null {
    return this.ac && this.ac.state === 'running' ? this.ac : null;
  }

  /** BGM側から使う: ノイズ素材(ハイハット等の合成用) */
  getNoise(): AudioBuffer | null {
    return this.noiseBuf;
  }

  /** 最初のユーザー操作で呼ぶ(スマホの自動再生制限対策) */
  unlock(): void {
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      // ノイズ(ザッという音)の素材を1秒分作っておく
      const buf = this.ac.createBuffer(1, this.ac.sampleRate, this.ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
  }

  /** ピッチが f0→f1 に変化する電子音を鳴らす */
  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    if (!this.ac || this.ac.state !== 'running') return;
    const t0 = this.ac.currentTime + delay;
    const osc = this.ac.createOscillator();
    const gain = this.ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** ザッというノイズ音(打撃感を出す) */
  private noise(dur: number, vol: number, filterFreq: number, delay = 0): void {
    if (!this.ac || this.ac.state !== 'running' || !this.noiseBuf) return;
    const t0 = this.ac.currentTime + delay;
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ac.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.ac.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---- ここから下が実際にゲームで鳴らす効果音 ----
  cursor(): void { this.tone(700, 900, 0.05, 'square', 0.12); }
  confirm(): void { this.tone(600, 1200, 0.12, 'square', 0.15); }
  cancel(): void { this.tone(500, 250, 0.1, 'square', 0.12); }
  jump(): void { this.tone(280, 660, 0.14, 'square', 0.12); }
  dash(): void { this.noise(0.12, 0.16, 2200); this.tone(420, 900, 0.1, 'square', 0.07); } // シュッという風切り音
  whiff(): void { this.noise(0.05, 0.08, 1600); } // 空振りのヒュッ
  punchHit(): void { this.noise(0.08, 0.25, 1000); this.tone(220, 120, 0.08, 'square', 0.2); }
  kickHit(): void { this.noise(0.11, 0.3, 650); this.tone(170, 70, 0.13, 'square', 0.25); }
  guard(): void { this.tone(950, 420, 0.07, 'square', 0.16); this.noise(0.04, 0.1, 2500); }
  shoot(): void { this.tone(880, 260, 0.2, 'sawtooth', 0.16); }
  special(): void { this.tone(180, 760, 0.28, 'sawtooth', 0.2); this.noise(0.15, 0.12, 1200); }
  specialHit(): void { this.noise(0.16, 0.32, 800); this.tone(300, 60, 0.25, 'sawtooth', 0.3); }
  ko(): void {
    this.tone(400, 45, 0.6, 'sawtooth', 0.3);
    this.noise(0.5, 0.28, 400);
    this.tone(200, 30, 0.7, 'square', 0.2, 0.1);
  }
  roundGo(): void { this.tone(520, 520, 0.13, 'square', 0.2); this.tone(780, 780, 0.22, 'square', 0.2, 0.16); }
  timeCount(): void { this.tone(1000, 1000, 0.05, 'square', 0.1); }
  win(): void {
    // 勝利ファンファーレ(ドミソド)
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => this.tone(f, f, 0.16, 'square', 0.16, i * 0.13));
  }
}
