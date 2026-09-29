// 開場測試：模擬「手機 Chrome」（有分享功能）和電腦，打開遊戲後實際點基礎按鈕，看有沒有出錯。
// 2026-09-29 v0.0.77～0.0.81 手機開場出錯、按鈕全壞，電腦測不出來，所以一定要兩種都測。
// 用法（在 repo 根目錄）：
//   python3 -m http.server 8765 &
//   node 測試/開場測試.js            （會用 npm root -g 底下的 playwright）
const path = require('path'), { execSync } = require('child_process');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const URL = process.env.URL || 'http://localhost:8765/index.html';
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  for (const phone of [true, false]) for (const ai of ['gemini', 'manual']) {
    const p = await b.newPage({viewport:{width:390, height:844}});
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
    await p.addInitScript(([phone, ai]) => {
      if (phone){ navigator.share = async () => {}; navigator.canShare = () => true; }
      if (!localStorage.getItem('wuxian_prefs')) localStorage.setItem('wuxian_prefs', JSON.stringify({ai}));
    }, [phone, ai]);
    await p.goto(URL); await p.waitForTimeout(800);
    await p.evaluate(() => { for (const id of ['modal', 'reorg', 'card', 'manual']) document.getElementById(id).classList.remove('open'); });
    const ok = [];
    const check = async (sel, test) => { try { await p.click(sel, {timeout:1500}); await p.waitForTimeout(150); ok.push(await test() ? '✓' : '✗'); } catch(e){ ok.push('✗'); }
      await p.evaluate(() => { for (const id of ['modal', 'reorg', 'card']) document.getElementById(id).classList.remove('open'); }); };
    const open = id => () => p.$eval('#' + id, e => e.classList.contains('open'));
    const aiLabel = await p.$eval('#aimode', e => e.textContent), count = await p.$eval('#count', e => e.textContent);
    await check('#list .litem >> nth=0', () => p.$$eval('.slot.filled', x => x.length > 0));
    for (const [sel, id] of [['#btn-stats', 'reorg'], ['#btn-settings', 'modal'], ['#btn-lab', 'reorg'], ['#btn-goals', 'reorg'], ['#btn-catorder', 'reorg']]) await check(sel, open(id));
    const pass = aiLabel && count && !ok.includes('✗') && !errs.length;
    if (!pass) bad++;
    console.log(`${pass ? '通過' : '失敗'}｜${phone ? '手機' : '電腦'}｜${ai}｜AI 標籤「${aiLabel}」｜${count}｜按鈕 ${ok.join('')}${errs.length ? '｜錯誤：' + errs.join(' / ') : ''}`);
    await p.close();
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
