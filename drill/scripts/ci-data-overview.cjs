// CI 用：本番データの概要を「件数だけ」表示する（名前・メールアドレスなどは出さない）。
// 家族アカウントや子どもの登録が重複していないかを確かめるためのもの
const { execFileSync } = require("node:child_process");

function query(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--remote", "--json", "--command", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

const families = query("SELECT id, substr(created_at,1,10) AS created FROM families ORDER BY created_at");
const parents = query("SELECT family_id, COUNT(*) AS n FROM parents GROUP BY family_id");
const children = query(
  `SELECT c.id, c.family_id, c.grade, substr(c.created_at,1,10) AS created,
          (SELECT COUNT(*) FROM children x WHERE x.family_id = c.family_id AND x.name = c.name) AS same_name,
          (SELECT COUNT(*) FROM devices d WHERE d.child_id = c.id AND d.revoked_at IS NULL) AS devices,
          (SELECT COUNT(*) FROM sessions s WHERE s.child_id = c.id) AS sessions,
          (SELECT MAX(study_date) FROM sessions s WHERE s.child_id = c.id) AS last_date,
          (SELECT COUNT(*) FROM daily_completion dc WHERE dc.child_id = c.id) AS achieved
     FROM children c ORDER BY c.family_id, c.grade, c.created_at`,
);

console.log(`家族アカウントの数: ${families.length}`);
families.forEach((f, i) => {
  const kids = children.filter((c) => c.family_id === f.id);
  console.log(`\n家族${i + 1}（作成 ${f.created}）: 親 ${parents.find((p) => p.family_id === f.id)?.n ?? 0}人 / 子ども ${kids.length}人`);
  kids.forEach((c, j) =>
    console.log(
      `  子ども${j + 1}: 小${c.grade} / 登録 ${c.created} / 同じ名前 ${c.same_name}件 / 端末 ${c.devices}台 / 学習 ${c.sessions}回（最後 ${c.last_date ?? "なし"}）/ 達成 ${c.achieved}日`,
    ),
  );
});
