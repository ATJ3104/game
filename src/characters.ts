// ================================================================
// ★★★ キャラクターせってい ファイル ★★★
//
// ロボットの「なまえ」「いろ」「つよさ」「ひっさつわざ」は、
// ぜんぶ この ファイルに かいてあるよ。
// ここの もじや すうじを かきかえて ほぞんするだけで、
// ゲームの キャラが かわるよ! (プログラムの ほかの ばしょは
// さわらなくて OK)
//
// 例) name: 'ガンテツ' → name: 'サイキョウマル' にすると
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
  bodyScale: number; // 体の大きさ 0.85(小さくてすばやい)〜1.2(大きくてパワフル)
  stats: {
    hp: number; // たいりょく 900〜1100
    walkSpeed: number; // あるくはやさ(1.0がふつう)
    jumpPower: number; // ジャンプ力(1.0がふつう)
    attackPower: number; // こうげき力の倍率 0.9〜1.15
  };
  special: {
    type: 'projectile' | 'uppercut' | 'dash' | 'spin'; // わざのタイプ
    name: string; // ひっさつわざの なまえ
    shout: string; // かけごえ(画面にふきだしで出る)
    color: string; // わざのエフェクトの色
    power: number; // 同じタイプの中での威力調整(1.0がふつう)
    speed: number; // 同じタイプの中でのはやさ調整(1.0がふつう)
  };
}

// ----------------------------------------------------------------
// ここから下が 8体分の せっていデータ!
// ----------------------------------------------------------------
export const CHARACTERS: RobotConfig[] = [
  {
    // ムエタイスタイルのパワーファイター
    id: 'c01',
    name: 'ガンテツ',
    typeLabel: 'パワー',
    portrait: 'assets/characters/c01_muaythai.webp',
    thumb: 'assets/characters/c01_muaythai_thumb.webp',
    colors: { primary: '#3A6B4A', secondary: '#C87137', accent: '#E8B84B', skin: '#8FA98F' },
    headGear: 'mohawk',
    bodyScale: 1.15,
    stats: { hp: 1080, walkSpeed: 0.85, jumpPower: 0.95, attackPower: 1.15 }, // HP高・鈍足・一撃が重い
    special: { type: 'dash', name: 'グランドニー', shout: 'ドガーン!', color: '#E8B84B', power: 1.25, speed: 0.85 },
  },
  {
    // 忍者スタイルのスピードファイター
    id: 'c02',
    name: 'シノビィ',
    typeLabel: 'スピード',
    portrait: 'assets/characters/c02_ninja.webp',
    thumb: 'assets/characters/c02_ninja_thumb.webp',
    colors: { primary: '#6A3FA0', secondary: '#1E1E24', accent: '#B08FE0', skin: '#8E7FB0' },
    headGear: 'ponytail',
    bodyScale: 0.9,
    stats: { hp: 920, walkSpeed: 1.25, jumpPower: 1.1, attackPower: 0.95 }, // 最速・HP低め
    special: { type: 'dash', name: 'シャドウスラッシュ', shout: 'しっぷう!', color: '#B08FE0', power: 0.9, speed: 1.3 },
  },
  {
    // 覆面レスラースタイルのパワーファイター
    id: 'c03',
    name: 'マスクスター',
    typeLabel: 'パワー',
    portrait: 'assets/characters/c03_luchador.webp',
    thumb: 'assets/characters/c03_luchador_thumb.webp',
    colors: { primary: '#2B4C9B', secondary: '#F5F0E1', accent: '#D9A62E', skin: '#4A66B0' },
    headGear: 'mask_wing',
    bodyScale: 1.15,
    stats: { hp: 1100, walkSpeed: 0.9, jumpPower: 1.15, attackPower: 1.1 }, // HP最高・ジャンプ強い
    special: { type: 'spin', name: 'スパイラルスター', shout: 'トルネードー!', color: '#D9A62E', power: 1.15, speed: 0.9 },
  },
  {
    // ボクサースタイルのバランスファイター
    id: 'c04',
    name: 'ブルービット',
    typeLabel: 'バランス',
    portrait: 'assets/characters/c04_boxer.webp',
    thumb: 'assets/characters/c04_boxer_thumb.webp',
    colors: { primary: '#16161C', secondary: '#29C5D6', accent: '#7FE9F5', skin: '#2E3E44' },
    headGear: 'techvisor',
    bodyScale: 1.0,
    stats: { hp: 1000, walkSpeed: 1.0, jumpPower: 1.0, attackPower: 1.0 }, // 対空が得意
    special: { type: 'uppercut', name: 'ロケットアッパー', shout: 'うちあげろ!', color: '#7FE9F5', power: 1.0, speed: 1.1 },
  },
  {
    // 雷スタイルのスピードファイター
    id: 'c05',
    name: 'ボルトン',
    typeLabel: 'スピード',
    portrait: 'assets/characters/c05_thunder.webp',
    thumb: 'assets/characters/c05_thunder_thumb.webp',
    colors: { primary: '#F2C11E', secondary: '#1F1F1F', accent: '#FFE97A', skin: '#D8B040' },
    headGear: 'spiky',
    bodyScale: 0.95,
    stats: { hp: 900, walkSpeed: 1.15, jumpPower: 1.05, attackPower: 1.15 }, // 攻撃力高・HP低(ガラスキャノン)
    special: { type: 'projectile', name: 'サンダーショット', shout: 'ビリビリだぜ!', color: '#FFE97A', power: 1.15, speed: 1.25 },
  },
  {
    // 僧侶スタイルの防御ファイター
    id: 'c06',
    name: 'ゼンマル',
    typeLabel: '防御',
    portrait: 'assets/characters/c06_monk.webp',
    thumb: 'assets/characters/c06_monk_thumb.webp',
    colors: { primary: '#EDE7DC', secondary: '#D97B2E', accent: '#7A5C3E', skin: '#D8CBB4' },
    headGear: 'bald',
    bodyScale: 1.0,
    stats: { hp: 1060, walkSpeed: 0.95, jumpPower: 0.95, attackPower: 1.0 }, // HP高め・堅実
    special: { type: 'projectile', name: 'ゼンビーム', shout: 'かーつ!', color: '#D97B2E', power: 1.0, speed: 0.85 },
  },
  {
    // カポエイラスタイルのスピードファイター
    id: 'c07',
    name: 'リズミー',
    typeLabel: 'スピード',
    portrait: 'assets/characters/c07_capoeira.webp',
    thumb: 'assets/characters/c07_capoeira_thumb.webp',
    colors: { primary: '#F0EAE2', secondary: '#E0447A', accent: '#35B5A0', skin: '#C9B9A6' },
    headGear: 'dreads',
    bodyScale: 0.9,
    stats: { hp: 930, walkSpeed: 1.2, jumpPower: 1.2, attackPower: 0.95 }, // 機動力・ジャンプ最強
    special: { type: 'spin', name: 'リズムサイクロン', shout: 'まわるよー!', color: '#35B5A0', power: 0.9, speed: 1.2 },
  },
  {
    // 主人公スタイルのバランスファイター
    id: 'c08',
    name: 'ブレイズ',
    typeLabel: 'バランス',
    portrait: 'assets/characters/c08_hero.webp',
    thumb: 'assets/characters/c08_hero_thumb.webp',
    colors: { primary: '#D33327', secondary: '#22222A', accent: '#F2F2F2', skin: '#B0524A' },
    headGear: 'headband',
    bodyScale: 1.0,
    stats: { hp: 1000, walkSpeed: 1.05, jumpPower: 1.05, attackPower: 1.05 }, // 全て平均の主人公型
    special: { type: 'uppercut', name: 'ライジングブレイズ', shout: 'いくぞー!', color: '#F2F2F2', power: 1.1, speed: 1.0 },
  },
];
