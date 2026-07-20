// ================================================================
// ★★★ キャラクターせってい ファイル ★★★
//
// ロボットの「なまえ」「いろ」「つよさ」「ひっさつわざ」は、
// ぜんぶ この ファイルに かいてあるよ。
// ここの もじや すうじを かきかえて ほぞんするだけで、
// ゲームの キャラが かわるよ! (プログラムの ほかの ばしょは
// さわらなくて OK)
//
// 例) name: 'イワタ' → name: 'サイキョウマル' にすると
//     ゲームの中の なまえも かわる!
// ================================================================

// ゲームのタイトル(あとで かえたくなったら ここを かきかえる)
export const GAME_TITLE = 'ロボファイター';

/** ロボット1体分の設定のかたち(スキーマ) */
export interface RobotConfig {
  id: string;
  name: string; // ロボットのなまえ
  typeLabel: string; // タイプ表示(パワー/スピード/バランス/防御)
  portrait: string; // ポートレート画像(キャラ選択・VS・勝利画面で使う)
  thumb: string; // サムネイル画像(キャラ選択のグリッドで使う)
  colors: {
    primary: string; // からだ(胴体・脚)の色
    secondary: string; // うで・サブパーツの色
    accent: string; // 目・ライト・エフェクトの色
    skin: string; // あたま・素肌部分の色
  };
  headGear:
    | 'mohawk'
    | 'ponytail'
    | 'mask_wing'
    | 'techvisor'
    | 'spiky'
    | 'bald'
    | 'dreads'
    | 'headband';
  /**
   * みための細かい調整(ポートレートの絵にちかづけるための色)。
   * 書かなかった部分は colors の色が自動で使われる。
   *  torso=胴体 legs=脚 arms=うで fists=こぶし feet=くつ
   *  belt=ベルト gear=かみがた・頭の飾り faceMask=口もとのマスク(忍者用)
   */
  look?: {
    torso?: string;
    legs?: string;
    arms?: string;
    fists?: string;
    feet?: string;
    belt?: string;
    gear?: string;
    faceMask?: string;
  };
  bodyScale: number; // 体の大きさ 0.85(小さくてすばやい)〜1.2(大きくてパワフル)
  stats: {
    hp: number; // たいりょく 900〜1100
    walkSpeed: number; // あるくはやさ(1.0がふつう)
    jumpPower: number; // ジャンプ力(1.0がふつう)
    attackPower: number; // こうげき力の倍率 0.9〜1.15
  };
  special: SpecialConfig; // ひっさつわざ①(ひっさつボタンで発動)
  special2: SpecialConfig; // ひっさつわざ②(しゃがみながら ひっさつボタン)
}

/** ひっさつわざ1つ分の設定 */
export interface SpecialConfig {
  type: 'projectile' | 'uppercut' | 'dash' | 'spin'; // わざのタイプ
  name: string; // ひっさつわざの なまえ
  shout: string; // かけごえ(画面にふきだしで出る)
  color: string; // わざのエフェクトの色
  power: number; // 同じタイプの中での威力調整(1.0がふつう)
  speed: number; // 同じタイプの中でのはやさ調整(1.0がふつう)
}

// ----------------------------------------------------------------
// ここから下が 8体分の せっていデータ!
// ----------------------------------------------------------------
export const CHARACTERS: RobotConfig[] = [
  {
    // ムエタイスタイルのパワーファイター
    id: 'c01',
    name: 'イワタ',
    typeLabel: 'パワー',
    portrait: 'assets/characters/c01_muaythai.webp',
    thumb: 'assets/characters/c01_muaythai_thumb.webp',
    colors: { primary: '#3A6B4A', secondary: '#C87137', accent: '#E8B84B', skin: '#C08850' },
    headGear: 'mohawk',
    // ポートレート再現: 日やけした肌 + 緑の道着 + 白い手のバンテージ + 黒いモヒカン
    look: { arms: '#C08850', fists: '#EDE3D0', feet: '#C08850', gear: '#332A20', belt: '#E8B84B' },
    bodyScale: 1.15,
    stats: { hp: 1080, walkSpeed: 0.85, jumpPower: 0.95, attackPower: 1.15 }, // HP高・鈍足・一撃が重い
    special: { type: 'dash', name: 'グランドニー', shout: 'ドガーン!', color: '#E8B84B', power: 1.25, speed: 0.85 },
    special2: { type: 'uppercut', name: 'ライジングエルボー', shout: 'せいやっ!', color: '#E8B84B', power: 1.15, speed: 0.95 },
  },
  {
    // 忍者スタイルのスピードファイター
    id: 'c02',
    name: 'モリ↓',
    typeLabel: 'スピード',
    portrait: 'assets/characters/c02_ninja.webp',
    thumb: 'assets/characters/c02_ninja_thumb.webp',
    colors: { primary: '#6A3FA0', secondary: '#1E1E24', accent: '#B08FE0', skin: '#EBD5C0' },
    headGear: 'ponytail',
    // ポートレート再現: 色白の肌 + 黒い口もとマスク + 黒いポニーテール + 紫の忍び装束
    look: { arms: '#6A3FA0', fists: '#1E1E24', gear: '#17151C', faceMask: '#1E1E24', belt: '#1E1E24' },
    bodyScale: 0.9,
    stats: { hp: 920, walkSpeed: 1.25, jumpPower: 1.1, attackPower: 0.95 }, // 最速・HP低め
    special: { type: 'dash', name: 'シャドウスラッシュ', shout: 'しっぷう!', color: '#B08FE0', power: 0.9, speed: 1.3 },
    special2: { type: 'projectile', name: 'シュリケンショット', shout: 'とうっ!', color: '#B08FE0', power: 0.9, speed: 1.4 },
  },
  {
    // 覆面レスラースタイルのパワーファイター
    id: 'c03',
    name: 'ママゴン',
    typeLabel: 'パワー',
    portrait: 'assets/characters/c03_luchador.webp',
    thumb: 'assets/characters/c03_luchador_thumb.webp',
    colors: { primary: '#2B4C9B', secondary: '#F5F0E1', accent: '#D9A62E', skin: '#3D57A8' },
    headGear: 'mask_wing',
    // ポートレート再現: 青いマスク + 白いスーツ + 金のベルトと羽 + 白いブーツ
    look: { torso: '#F5F0E1', legs: '#2B4C9B', arms: '#2B4C9B', fists: '#F5F0E1', feet: '#F5F0E1', belt: '#D9A62E', gear: '#D9A62E' },
    bodyScale: 1.15,
    stats: { hp: 1100, walkSpeed: 0.9, jumpPower: 1.15, attackPower: 1.1 }, // HP最高・ジャンプ強い
    special: { type: 'spin', name: 'スパイラルスター', shout: 'トルネードー!', color: '#D9A62E', power: 1.15, speed: 0.9 },
    special2: { type: 'dash', name: 'フライングタックル', shout: 'ドッカーン!', color: '#D9A62E', power: 1.2, speed: 0.95 },
  },
  {
    // ボクサースタイルのバランスファイター
    id: 'c04',
    name: 'ヒカル',
    typeLabel: 'バランス',
    portrait: 'assets/characters/c04_boxer.webp',
    thumb: 'assets/characters/c04_boxer_thumb.webp',
    colors: { primary: '#16161C', secondary: '#29C5D6', accent: '#7FE9F5', skin: '#232B31' },
    headGear: 'techvisor',
    // ポートレート再現: 黒いボディ + シアンに光るバイザー + シアンのボクシンググローブ
    look: { arms: '#16161C', fists: '#29C5D6', feet: '#29C5D6', belt: '#29C5D6', gear: '#7FE9F5' },
    bodyScale: 1.0,
    stats: { hp: 1000, walkSpeed: 1.0, jumpPower: 1.0, attackPower: 1.0 }, // 対空が得意
    special: { type: 'uppercut', name: 'ロケットアッパー', shout: 'うちあげろ!', color: '#7FE9F5', power: 1.0, speed: 1.1 },
    special2: { type: 'dash', name: 'ソニックストレート', shout: 'ビュン!', color: '#7FE9F5', power: 1.0, speed: 1.2 },
  },
  {
    // 雷スタイルのスピードファイター
    id: 'c05',
    name: 'スカイ',
    typeLabel: 'スピード',
    portrait: 'assets/characters/c05_thunder.webp',
    thumb: 'assets/characters/c05_thunder_thumb.webp',
    colors: { primary: '#F2C11E', secondary: '#1F1F1F', accent: '#FFE97A', skin: '#E4BC6A' },
    headGear: 'spiky',
    // ポートレート再現: 金髪ツンツンヘアー + 黒い服に黄色のイナズマ差し色
    look: { torso: '#1F1F1F', legs: '#1F1F1F', arms: '#1F1F1F', fists: '#F2C11E', feet: '#F2C11E', belt: '#F2C11E', gear: '#F2C11E' },
    bodyScale: 0.95,
    stats: { hp: 900, walkSpeed: 1.15, jumpPower: 1.05, attackPower: 1.15 }, // 攻撃力高・HP低(ガラスキャノン)
    special: { type: 'projectile', name: 'サンダーショット', shout: 'ビリビリだぜ!', color: '#FFE97A', power: 1.15, speed: 1.25 },
    special2: { type: 'uppercut', name: 'イナズマアッパー', shout: 'ビリビリッ!', color: '#FFE97A', power: 1.1, speed: 1.05 },
  },
  {
    // 僧侶スタイルの防御ファイター
    id: 'c06',
    name: 'パピー',
    typeLabel: '防御',
    portrait: 'assets/characters/c06_monk.webp',
    thumb: 'assets/characters/c06_monk_thumb.webp',
    colors: { primary: '#EDE7DC', secondary: '#D97B2E', accent: '#7A5C3E', skin: '#D9B489' },
    headGear: 'bald',
    // ポートレート再現: つるつる頭のおぼうさん + 白い法衣 + オレンジのたすき + 素肌のうで
    look: { arms: '#D9B489', fists: '#D9B489', feet: '#7A5C3E', belt: '#D97B2E' },
    bodyScale: 1.0,
    stats: { hp: 1060, walkSpeed: 0.95, jumpPower: 0.95, attackPower: 1.0 }, // HP高め・堅実
    special: { type: 'projectile', name: 'ゼンビーム', shout: 'かーつ!', color: '#D97B2E', power: 1.0, speed: 0.85 },
    special2: { type: 'spin', name: 'ゼンゼンスピン', shout: 'むむむ!', color: '#D97B2E', power: 1.0, speed: 0.95 },
  },
  {
    // カポエイラスタイルのスピードファイター
    id: 'c07',
    name: 'オトハ',
    typeLabel: 'スピード',
    portrait: 'assets/characters/c07_capoeira.webp',
    thumb: 'assets/characters/c07_capoeira_thumb.webp',
    colors: { primary: '#F0EAE2', secondary: '#E0447A', accent: '#35B5A0', skin: '#8A5A3C' },
    headGear: 'dreads',
    // ポートレート再現: 褐色の肌 + 黒いドレッドヘアー + ピンクのトップス + 白いパンツ
    look: { torso: '#E0447A', legs: '#F0EAE2', arms: '#8A5A3C', fists: '#8A5A3C', feet: '#F0EAE2', belt: '#35B5A0', gear: '#2B2118' },
    bodyScale: 0.9,
    stats: { hp: 930, walkSpeed: 1.2, jumpPower: 1.2, attackPower: 0.95 }, // 機動力・ジャンプ最強
    special: { type: 'spin', name: 'リズムサイクロン', shout: 'まわるよー!', color: '#35B5A0', power: 0.9, speed: 1.2 },
    special2: { type: 'uppercut', name: 'リズムフリップ', shout: 'イェーイ!', color: '#35B5A0', power: 0.95, speed: 1.15 },
  },
  {
    // 主人公スタイルのバランスファイター
    id: 'c08',
    name: 'シュウマ',
    typeLabel: 'バランス',
    portrait: 'assets/characters/c08_hero.webp',
    thumb: 'assets/characters/c08_hero_thumb.webp',
    colors: { primary: '#D33327', secondary: '#22222A', accent: '#F2F2F2', skin: '#E5B78E' },
    headGear: 'headband',
    // ポートレート再現: 赤いジャケット + 黒いインナーとパンツ + 赤いハチマキ + 赤いスニーカー
    look: { legs: '#22222A', arms: '#D33327', fists: '#E5B78E', feet: '#C22B20', belt: '#F2F2F2', gear: '#C22B20' },
    bodyScale: 1.0,
    stats: { hp: 1000, walkSpeed: 1.05, jumpPower: 1.05, attackPower: 1.05 }, // 全て平均の主人公型
    special: { type: 'uppercut', name: 'ライジングブレイズ', shout: 'いくぞー!', color: '#F2F2F2', power: 1.1, speed: 1.0 },
    special2: { type: 'projectile', name: 'ブレイズショット', shout: 'はっしゃ!', color: '#F2F2F2', power: 1.05, speed: 1.1 },
  },
];
