// アプリを実際のブラウザで開いて、各タイトルでチャートが出るかを確認する。
//
// 使い方:
//   npm run dev        （別のターミナルで起動しておく）
//   npm run verify
//
// Playwrightのブラウザは社内プロキシの証明書で落とせないので、
// Windowsに入っているEdgeを channel: 'msedge' で使う。
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

/** タイトルと目標を選び、結果が出るまでの時間と表示内容を返す */
async function chart(title, monster) {
  await page.goto(`${BASE}/auto`, { waitUntil: 'networkidle' });
  const selects = page.locator('select');
  await selects.nth(0).selectOption({ label: title });
  await page.waitForTimeout(250);

  let target = null;
  const n = await selects.count();
  for (let i = 0; i < n; i++) {
    if ((await selects.nth(i).innerHTML()).includes('選択してください')) {
      target = selects.nth(i);
      break;
    }
  }
  if (!target) return { why: '目標モンスターの選択欄が見つからない' };

  const options = await target.locator('option').allTextContents();
  const hit = options.find((o) => o.startsWith(`${monster}（`));
  if (!hit) return { why: `${monster} が選択肢に無い` };

  const started = Date.now();
  await target.selectOption({ label: hit });
  await page
    .waitForFunction(() => /配合|入手/.test(document.body.innerText.slice(1500)), { timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => {
    const el = document.querySelector('.card + div, p.rounded-lg');
    return (el?.innerText ?? document.body.innerText).slice(0, 160).replace(/\n/g, ' ');
  });
  return { ms: Date.now() - started, text };
}

// 各タイトルで、そのタイトルに実在する終着点あたりのモンスターを1体
const cases = [
  ['ジョーカー1', 'ラプソーン'],
  ['ジョーカー2', '竜神王'],
  ['ジョーカー2プロ', '神鳥レティス'],
  ['テリワン3D', 'ダークドレアム'],
  ['イルルカ3DS', 'メタルゴッデス'],
  ['ジョーカー3', 'エスターク'],
  ['ジョーカー3プロ', 'マスタードラゴン'],
  ['テリワンSP', '大魔王マデュラージャ'],
  ['イルルカSP', 'マジェスドレアム'],
  ['ドラゴンクエストモンスターズ3', 'ダークドレアム'],
];

let failed = 0;
for (const [title, monster] of cases) {
  const r = await chart(title, monster);
  if (r.why) {
    console.log(`✗ ${title} / ${monster}: ${r.why}`);
    failed += 1;
    continue;
  }
  console.log(`✓ ${title.padEnd(22)} ${monster.padEnd(20)} ${String(r.ms).padStart(5)}ms  ${r.text}`);
}

console.log(`\nコンソールエラー: ${errors.length ? errors.slice(0, 5).join(' | ') : 'なし'}`);
await browser.close();
if (failed || errors.length) process.exit(1);
