import { requireParentPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { getFamilySettings, listChildren } from "@/server/repo";
import { ActionForm, btnDanger, Field, inputCls, labelCls } from "@/ui/ActionForm";
import { MATH_LEVELS } from "@/domain/math/levels";
import {
  addChildAction,
  addParentAction,
  issuePairingCodeAction,
  revokeDeviceAction,
  setLevelAction,
  updateChildAction,
  updateFamilySettingsAction,
} from "./actions";
import { PairingCode } from "./PairingCode";

export const dynamic = "force-dynamic";

const GRADES = [1, 2, 3, 4, 5, 6];

function GradeSelect({ defaultValue }: { defaultValue?: number }) {
  return (
    <label className="block">
      <span className={labelCls}>学年</span>
      <select name="grade" defaultValue={defaultValue ?? 1} className={inputCls}>
        {GRADES.map((g) => (
          <option key={g} value={g}>
            小{g}
          </option>
        ))}
      </select>
    </label>
  );
}

function LevelSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? "M01"} className={inputCls}>
      {MATH_LEVELS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.code} {l.name}
        </option>
      ))}
    </select>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" });
}

export default async function SettingsPage() {
  const { parent } = await requireParentPage();
  const db = await getDB();
  const [children, settings, parents, devices, levels] = await Promise.all([
    listChildren(db, parent.family_id),
    getFamilySettings(db, parent.family_id),
    db
      .prepare("SELECT id, name, email, pin_hash IS NOT NULL AS has_pin FROM parents WHERE family_id = ? ORDER BY created_at")
      .bind(parent.family_id)
      .all<{ id: string; name: string; email: string; has_pin: number }>(),
    db
      .prepare(
        `SELECT d.id, d.child_id, d.label, d.created_at, d.last_seen_at FROM devices d
          JOIN children c ON c.id = d.child_id
         WHERE c.family_id = ? AND d.revoked_at IS NULL ORDER BY d.created_at`,
      )
      .bind(parent.family_id)
      .all<{ id: string; child_id: string; label: string; created_at: string; last_seen_at: string | null }>(),
    db
      .prepare(
        `SELECT l.child_id, l.level_code FROM child_levels l JOIN children c ON c.id = l.child_id
          WHERE c.family_id = ? AND l.subject = 'math'`,
      )
      .bind(parent.family_id)
      .all<{ child_id: string; level_code: string }>(),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">設定</h1>

      {children.map((c) => {
        const level = levels.results.find((l) => l.child_id === c.id)?.level_code;
        const childDevices = devices.results.filter((d) => d.child_id === c.id);
        return (
          <section key={c.id} className="space-y-5 rounded-2xl border p-4">
            <h2 className="text-lg font-bold">{c.name}</h2>

            <ActionForm action={updateChildAction} submitLabel="保存">
              <input type="hidden" name="child_id" value={c.id} />
              <Field label="名前" name="name" defaultValue={c.name} required maxLength={20} />
              <GradeSelect defaultValue={c.grade} />
              <Field label="算数の時間（分）" name="minutes_math" type="number" inputMode="numeric" min={1} max={120} defaultValue={c.minutes_math} required />
              <p className="text-xs text-gray-500">国語・英語は準備中です（いまは算数のみ）。</p>
              <Field label="お小遣いの金額（円・表示用）" name="allowance_amount" type="number" inputMode="numeric" min={0} defaultValue={c.allowance_amount} required />
              <label className="block">
                <span className={labelCls}>漢字の表示</span>
                <select name="furigana_mode" defaultValue={c.furigana_mode} className={inputCls}>
                  <option value="none">そのまま</option>
                  <option value="furigana">ふりがなをつける</option>
                  <option value="hiragana">ひらがなで表示</option>
                </select>
              </label>
            </ActionForm>

            <ActionForm action={setLevelAction} submitLabel="レベルを変更">
              <input type="hidden" name="child_id" value={c.id} />
              <input type="hidden" name="subject" value="math" />
              <label className="block">
                <span className={labelCls}>算数のレベル（手動で上げ下げ）</span>
                <LevelSelect name="level_code" defaultValue={level} />
              </label>
            </ActionForm>

            <div className="space-y-3">
              <h3 className="font-bold">端末</h3>
              {childDevices.length === 0 && <p className="text-sm text-gray-500">登録された端末はありません</p>}
              {childDevices.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-3">
                  <div className="text-sm">
                    <div className="font-bold">{d.label}</div>
                    <div className="text-gray-500">登録 {fmt(d.created_at)}／最終利用 {fmt(d.last_seen_at)}</div>
                  </div>
                  <ActionForm action={revokeDeviceAction} submitLabel="解除" className="shrink-0" submitClassName={btnDanger}>
                    <input type="hidden" name="device_id" value={d.id} />
                  </ActionForm>
                </div>
              ))}
              <PairingCode childId={c.id} action={issuePairingCodeAction} />
            </div>
          </section>
        );
      })}

      <section className="space-y-4 rounded-2xl border p-4">
        <h2 className="text-lg font-bold">子どもを追加</h2>
        <ActionForm action={addChildAction} submitLabel="追加">
          <Field label="名前" name="name" required maxLength={20} />
          <GradeSelect />
          <Field label="算数の時間（分）" name="minutes_math" type="number" inputMode="numeric" min={1} max={120} defaultValue={10} required />
          <label className="block">
            <span className={labelCls}>算数の初期レベル</span>
            <LevelSelect name="level_math" />
          </label>
        </ActionForm>
      </section>

      <section className="space-y-4 rounded-2xl border p-4">
        <h2 className="text-lg font-bold">おうちの人</h2>
        <ul className="space-y-1 text-sm">
          {parents.results.map((p) => (
            <li key={p.id}>
              {p.name}（{p.email}）{p.has_pin ? "" : "・初回ログイン待ち"}
            </li>
          ))}
        </ul>
        {parents.results.length < 2 && (
          <ActionForm action={addParentAction} submitLabel="2人目を追加">
            <Field label="お名前" name="name" required maxLength={30} />
            <Field label="メールアドレス" name="email" type="email" required />
            <Field label="仮パスワード（8文字以上）" name="password" type="text" required minLength={8} autoComplete="off" />
          </ActionForm>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border p-4">
        <h2 className="text-lg font-bold">家族の設定</h2>
        <ActionForm action={updateFamilySettingsAction} submitLabel="保存">
          <Field label="日の区切り（日本時間・時）" name="dayBoundaryHour" type="number" min={0} max={23} defaultValue={settings.dayBoundaryHour} required />
          <Field label="当て推量とみなす速さ（算数・ミリ秒未満）" name="guessMath" type="number" min={0} max={10000} defaultValue={settings.guessThresholdMs.math} required />
          <Field label="進級：直近何回" name="promoteSessions" type="number" min={1} max={20} defaultValue={settings.promoteSessions} required />
          <Field label="進級：正答率（%以上）" name="promoteAccuracy" type="number" min={0} max={100} defaultValue={Math.round(settings.promoteAccuracy * 100)} required />
          <Field label="復習：直近何回続けて" name="reviewSessions" type="number" min={1} max={20} defaultValue={settings.reviewSessions} required />
          <Field label="復習：正答率（%未満）" name="reviewAccuracy" type="number" min={0} max={100} defaultValue={Math.round(settings.reviewAccuracy * 100)} required />
        </ActionForm>
      </section>
    </div>
  );
}
