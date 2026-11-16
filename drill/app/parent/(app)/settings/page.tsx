import { requireParentPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { getFamilySettings, listChildren } from "@/server/repo";
import { ActionForm, btnDanger, Field, inputCls, labelCls } from "@/ui/ActionForm";
import { availableLevels } from "@/domain/levels";
import type { Subject } from "@/domain/settings";
import { levelOptions } from "@/server/contentPolicy";
import {
  addChildAction,
  addParentAction,
  changeMyPasswordAction,
  resetParentPasswordAction,
  deleteChildAction,
  issueFamilyInviteAction,
  issueLineCodeAction,
  joinFamilyAction,
  unlinkLineAction,
  updateLineSettingsAction,
  issuePairingCodeAction,
  revokeDeviceAction,
  setLevelAction,
  updateChildAction,
  updateFamilySettingsAction,
} from "./actions";
import { PairingCode } from "./PairingCode";
import { LineCode } from "./LineCode";
import { getLineLink, lineAddFriendUrl, lineConfig } from "@/server/notifications";
import { estimateMonthlyMessages, type CompleteMode } from "@/domain/notify";

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

function LevelSelect({ name, subject, defaultValue }: { name: string; subject: Subject; defaultValue?: string }) {
  const levels = availableLevels(subject, levelOptions());
  return (
    <select name={name} defaultValue={defaultValue ?? (subject === "math" ? "M01" : "none")} className={inputCls}>
      {subject !== "math" && <option value="none">やらない</option>}
      {levels.map((l) => (
        <option key={l.code} value={l.code}>
          {l.code} {l.name}
          {l.unreviewed ? "（未確認の教材）" : ""}
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
        `SELECT l.child_id, l.subject, l.level_code FROM child_levels l JOIN children c ON c.id = l.child_id
          WHERE c.family_id = ?`,
      )
      .bind(parent.family_id)
      .all<{ child_id: string; subject: Subject; level_code: string }>(),
  ]);

  const used = await db
    .prepare(
      "SELECT s.child_id, COUNT(*) AS n FROM sessions s JOIN children c ON c.id = s.child_id WHERE c.family_id = ? GROUP BY s.child_id",
    )
    .bind(parent.family_id)
    .all<{ child_id: string; n: number }>();
  const usedOf = (childId: string) => used.results.find((u) => u.child_id === childId)?.n ?? 0;
  const [lineLink, lineReady, friendUrl, familyLinks] = await Promise.all([
    getLineLink(db, parent.id),
    lineConfig().then((c) => !!c),
    lineAddFriendUrl(),
    db
      .prepare("SELECT l.notify_complete, l.notify_reminder FROM line_links l JOIN parents p ON p.id = l.parent_id WHERE p.family_id = ?")
      .bind(parent.family_id)
      .all<{ notify_complete: CompleteMode; notify_reminder: number }>(),
  ]);
  const monthly = estimateMonthlyMessages(
    familyLinks.results.map((l) => ({ complete: l.notify_complete, reminder: l.notify_reminder === 1 })),
    children.length,
  );

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">設定</h1>

      {children.map((c) => {
        const levelOf = (subject: Subject) =>
          levels.results.find((l) => l.child_id === c.id && l.subject === subject)?.level_code;
        const childDevices = devices.results.filter((d) => d.child_id === c.id);
        return (
          <section key={c.id} className="space-y-5 rounded-2xl border p-4">
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold">
              {c.name}
              <span className="text-xs font-normal text-gray-500">
                小{c.grade}・端末 {childDevices.length}台・学習の記録 {usedOf(c.id) > 0 ? `${usedOf(c.id)}回` : "なし"}
              </span>
            </h2>
            {usedOf(c.id) === 0 && (
              <div className="rounded-xl bg-gray-50 p-3" data-testid="delete-child">
                <p className="mb-2 text-xs text-gray-600">
                  この子どもには学習の記録がありません。まちがえて登録した場合は削除できます。
                </p>
                <ActionForm action={deleteChildAction} submitLabel="この登録を削除" submitClassName={btnDanger}>
                  <input type="hidden" name="child_id" value={c.id} />
                </ActionForm>
              </div>
            )}

            <ActionForm action={updateChildAction} submitLabel="保存">
              <input type="hidden" name="child_id" value={c.id} />
              <Field label="名前" name="name" defaultValue={c.name} required maxLength={20} />
              <GradeSelect defaultValue={c.grade} />
              <div className="grid grid-cols-3 gap-3">
                <Field label="算数（分）" name="minutes_math" type="number" inputMode="numeric" min={1} max={120} defaultValue={c.minutes_math} required />
                <Field label="国語（分）" name="minutes_japanese" type="number" inputMode="numeric" min={1} max={120} defaultValue={c.minutes_japanese} required />
                <Field label="英語（分）" name="minutes_english" type="number" inputMode="numeric" min={1} max={120} defaultValue={c.minutes_english} required />
              </div>
              <p className="text-xs text-gray-500">
                1日の合計：
                {c.minutes_math + (levelOf("japanese") ? c.minutes_japanese : 0) + (levelOf("english") ? c.minutes_english : 0)}
                分（「やらない」にした教科は数えません）
              </p>
              <p className="text-xs text-gray-500">
                時間は目安です。教科は「その時間で終わる想定の問題数」を解くと完了になります（時間がたつだけでは終わりません）。問題数はレベルによって変わり、時間を増減すると問題数も増減します。
              </p>
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

            <ActionForm action={setLevelAction} submitLabel="算数のレベルを変更">
              <input type="hidden" name="child_id" value={c.id} />
              <input type="hidden" name="subject" value="math" />
              <label className="block">
                <span className={labelCls}>算数のレベル（手動で上げ下げ）</span>
                <LevelSelect name="level_code" subject="math" defaultValue={levelOf("math")} />
              </label>
            </ActionForm>

            <ActionForm action={setLevelAction} submitLabel="国語のレベルを変更">
              <input type="hidden" name="child_id" value={c.id} />
              <input type="hidden" name="subject" value="japanese" />
              <label className="block">
                <span className={labelCls}>国語のレベル（「やらない」でメニューから外す）</span>
                <LevelSelect name="level_code" subject="japanese" defaultValue={levelOf("japanese")} />
              </label>
            </ActionForm>

            <ActionForm action={setLevelAction} submitLabel="英語のレベルを変更">
              <input type="hidden" name="child_id" value={c.id} />
              <input type="hidden" name="subject" value="english" />
              <label className="block">
                <span className={labelCls}>英語のレベル（「やらない」でメニューから外す）</span>
                <LevelSelect name="level_code" subject="english" defaultValue={levelOf("english")} />
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
        <p className="text-sm text-gray-600">
          すでに登録した子どもの内容を変えるときは、ここではなく上のその子の欄で「保存」を押してください。
        </p>
        <ActionForm action={addChildAction} submitLabel="追加" resetOnOk>
          <Field label="名前" name="name" required maxLength={20} />
          <GradeSelect />
          <Field label="算数の時間（分）" name="minutes_math" type="number" inputMode="numeric" min={1} max={120} defaultValue={10} required />
          <label className="block">
            <span className={labelCls}>算数の初期レベル</span>
            <LevelSelect name="level_math" subject="math" />
          </label>
          <Field label="国語の時間（分）" name="minutes_japanese" type="number" inputMode="numeric" min={1} max={120} defaultValue={10} required />
          <label className="block">
            <span className={labelCls}>国語の初期レベル</span>
            <LevelSelect name="level_japanese" subject="japanese" />
          </label>
          <Field label="英語の時間（分）" name="minutes_english" type="number" inputMode="numeric" min={1} max={120} defaultValue={10} required />
          <label className="block">
            <span className={labelCls}>英語の初期レベル</span>
            <LevelSelect name="level_english" subject="english" />
          </label>
        </ActionForm>
      </section>

      <section className="space-y-4 rounded-2xl border p-4" data-testid="line-section">
        <h2 className="text-lg font-bold">LINE 通知</h2>
        {!lineReady ? (
          <p className="text-sm text-gray-600">
            LINE の公式アカウントがまだ設定されていません（README の「LINE 通知の準備」を参照）。
          </p>
        ) : lineLink ? (
          <>
            <p className="rounded-xl bg-green-50 p-3 text-sm font-bold text-green-800" data-testid="line-linked">
              ✅ {parent.name} さんの LINE と連携ずみ
            </p>
            <ActionForm action={updateLineSettingsAction} submitLabel="通知の設定を保存">
              <label className="block">
                <span className={labelCls}>ドリルが終わったときの通知</span>
                <select name="notify_complete" defaultValue={lineLink.notify_complete} className={inputCls}>
                  <option value="each">子どもが1人終わるたびに</option>
                  <option value="all">全員が終わったときだけ</option>
                  <option value="off">送らない</option>
                </select>
              </label>
              <label className="flex min-h-12 items-center gap-3">
                <input type="checkbox" name="notify_reminder" defaultChecked={lineLink.notify_reminder === 1} className="h-5 w-5" />
                <span>決まった時刻に、まだ終わっていない子がいたら知らせる</span>
              </label>
              <Field label="知らせる時刻（日本時間・時、15〜23。家族で共通）" name="reminderHour" type="number" min={15} max={23} defaultValue={settings.reminderHour} required />
            </ActionForm>
            <p className="text-xs text-gray-500">
              送る通数のめやす：月 約{monthly}通（家族全員の合計）。LINE の無料プランは月200通までで、こえた分は送られません。多いときは「全員が終わったときだけ」にしてください。
            </p>
            <ActionForm action={unlinkLineAction} submitLabel="LINE の連携を解除" submitClassName={btnDanger}>
              <span />
            </ActionForm>
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
              <li>
                {friendUrl ? (
                  <a href={friendUrl} target="_blank" rel="noreferrer" className="font-bold text-green-700 underline">
                    まいにちドリルの LINE アカウントを友だちに追加
                  </a>
                ) : (
                  "まいにちドリルの LINE アカウントを友だちに追加"
                )}
              </li>
              <li>下のボタンで連携コードを発行し、その数字を LINE のトークに送る</li>
            </ol>
            <LineCode action={issueLineCodeAction} />
          </>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border p-4">
        <h2 className="text-lg font-bold">おうちの人</h2>
        <ul className="space-y-1 text-sm">
          {parents.results.map((p) => (
            <li key={p.id}>
              {p.name}（{p.email}）{p.id === parent.id ? "・ログイン中" : ""}
              {p.has_pin ? "" : "・初回ログイン待ち"}
            </li>
          ))}
        </ul>

        <details className="rounded-xl bg-gray-50 p-3" data-testid="my-password">
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-bold">自分のパスワードを変更（{parent.name}）</summary>
          <p className="mb-3 text-xs text-gray-600">
            今のパスワードを忘れていても、ここで新しく決められます。本人確認のため PIN を入力します。ログイン用のメールアドレスは {parent.email} です。
          </p>
          <ActionForm action={changeMyPasswordAction} submitLabel="パスワードを変更" resetOnOk>
            <Field label="新しいパスワード（8文字以上）" name="password" type="password" autoComplete="new-password" required minLength={8} />
            <Field label="新しいパスワード（確認）" name="password2" type="password" autoComplete="new-password" required minLength={8} />
            <Field label="PIN（4桁）" name="pin" type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" autoComplete="off" required />
          </ActionForm>
        </details>

        {parents.results
          .filter((p) => p.id !== parent.id)
          .map((p) => (
            <details key={p.id} className="rounded-xl bg-gray-50 p-3" data-testid="reset-password">
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-bold">{p.name} さんのパスワードを再設定</summary>
              <p className="mb-3 text-xs text-gray-600">
                仮パスワードを設定します。{p.name} さんは、次のログインで自分のパスワードに変えます。あなた（{parent.name}）の PIN を入力してください。
              </p>
              <ActionForm action={resetParentPasswordAction} submitLabel="仮パスワードを設定" resetOnOk>
                <input type="hidden" name="parent_id" value={p.id} />
                <Field label="仮パスワード（8文字以上）" name="password" type="text" autoComplete="off" required minLength={8} />
                <Field label={`${parent.name} さんの PIN（4桁）`} name="pin" type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" autoComplete="off" required />
              </ActionForm>
            </details>
          ))}
        {parents.results.length < 4 && (
          <ActionForm action={addParentAction} submitLabel="おうちの人を追加" resetOnOk>
            <Field label="お名前" name="name" required maxLength={30} />
            <Field label="メールアドレス" name="email" type="email" required />
            <Field label="仮パスワード（8文字以上）" name="password" type="text" required minLength={8} autoComplete="off" />
          </ActionForm>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border p-4" data-testid="merge-section">
        <h2 className="text-lg font-bold">家族アカウントをまとめる</h2>
        <p className="text-sm text-gray-600">
          おうちの人がそれぞれ別の家族アカウントを作ってしまうと、見える子どもや進み具合がちがってしまいます。1つにまとめると、どの端末・だれのログインでも同じ内容になります。
        </p>
        <div className="space-y-2 rounded-xl bg-gray-50 p-3">
          <h3 className="text-sm font-bold">① 子どもの端末が登録されているほうのアカウントで</h3>
          <LineCode
            action={issueFamilyInviteAction}
            label="招待コードを発行"
            help="もう一方のおうちの人が、自分の「設定」のこの欄（②）に入力します"
            note="まで有効（30分）"
            testId="family-invite-code"
          />
        </div>
        <div className="space-y-2 rounded-xl bg-gray-50 p-3">
          <h3 className="text-sm font-bold">② まとめられるほう（参加するほう）のアカウントで</h3>
          <ActionForm action={joinFamilyAction} submitLabel="この家族アカウントに参加する">
            <Field label="招待コード（8けた）" name="code" inputMode="numeric" maxLength={8} pattern="[0-9]{8}" autoComplete="off" required />
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="confirm" className="mt-1 h-5 w-5 shrink-0" />
              <span>
                いまのアカウント（子ども {children.length}人）から、招待された家族アカウントに移ります。いまのアカウントの子どものうち、学習の記録がない登録は削除されます。
              </span>
            </label>
          </ActionForm>
        </div>
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
