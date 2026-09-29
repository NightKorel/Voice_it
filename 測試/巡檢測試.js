// 巡檢測試：模擬手機（有分享功能），用手動模式自動回答 AI，走過大部分功能，收集所有錯誤。
// 用法（在 repo 根目錄）：
//   python3 -m http.server 8765 &
//   node 測試/巡檢測試.js              （手機）
//   DESKTOP=1 node 測試/巡檢測試.js    （電腦，會多測快捷鍵）
// 每一步印「✓／✗ 步驟名」，最後列出所有錯誤；有錯就回傳失敗。
const path = require('path'), fs = require('fs'), os = require('os'), { execSync } = require('child_process');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const URL = process.env.URL || 'http://localhost:8765/index.html';
const PHONE = process.env.DESKTOP ? false : true;
const vm = require('vm');
const ctxS = {window:{}}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'starter.js'), 'utf8'), ctxS);
const ST = ctxS.window.STARTER;

// 一份「玩了一陣子」的存檔：內建圖鑑前 60 樣、幾樣專有名詞、收藏夾、目標
const items = {'水':{emoji:'💧',t:0},'火':{emoji:'🔥',t:1},'風':{emoji:'🌬️',t:2},'土':{emoji:'🌍',t:3}};
let t = 10;
for (const [n, d] of Object.entries(ST.items).slice(0, 60)) items[n] = {emoji:d[0], desc:d[1], rarity:d[2], cat:d[3], color:d[4], t:t++};
Object.assign(items, {'皮卡丘':{emoji:'⚡',desc:'電氣鼠',rarity:2,cat:'專有名詞',sub:'角色',color:'#f2d330',t:t++}, '舊生物':{emoji:'🐛',desc:'舊版分類',rarity:1,cat:'生物',color:'#558833',t:t++}, '哈利波特':{emoji:'🧙',desc:'巫師',rarity:2,cat:'專有名詞',color:'#553322',t:t++}, '測試甲':{emoji:'🅰️',desc:'a',rarity:1,cat:'物品',color:'#888888',t:t++}, '測試乙':{emoji:'🅱️',desc:'b',rarity:1,cat:'物品',color:'#888888',t:t++}});
const recipes = {}; for (const [a, b, r] of ST.recipes) if (items[a] && items[b] && items[r]) recipes[[a, b].sort().join('+')] = [r];
const SAVE = {items, recipes, extracts:{}, folders:[{name:'喜歡', items:['皮卡丘']}], userCats:[], goals:[{name:'彩虹', t:1}], meta:{ai:'manual'}};

let uid = 0;
function answerFor(pr){
  const js = pr.slice(pr.lastIndexOf('【回答格式】'));
  const item = n => ({name:n, emoji:'🧪', proper:false, desc:'測試用的東西', rarity:3, tags:['物品', '科技'], color:'#44aa66'});
  if (js.includes('"quests"')) return {quests:[{name:'巡檢題甲', emoji:'🎯'}, {name:'巡檢題乙', emoji:'🎯'}, {name:'水', emoji:'💧'}]};
  if (js.includes('"parts"')) return {parts:[item('巡檢零件' + (++uid)), item('巡檢零件' + (++uid))]};
  if (js.includes('"bases"')) return {cats:['巡檢角色', '巡檢地點', '巡檢道具'], bases:[item('巡檢起點甲'), item('巡檢起點乙'), item('巡檢起點丙')]};
  // 提議新標籤：給一個，貼到測試甲上
  if (js.includes('"tags"') && js.includes('"items"') && pr.includes('最多提議 5 個')) return {tags:[{name:'巡檢新標籤', items:['測試甲', '皮卡丘']}]};
  // 重新貼標籤、檢查標籤、貼你的標籤：每樣都給兩個標籤
  if (js.includes('"items"')){ const names = [...pr.matchAll(/^(.+?)：/gm)].map(m => m[1]).filter(n => items[n] || /巡檢|測試/.test(n)); return {items:names.slice(0, 5).map(n => ({name:n, tags:['物品', '日常']}))}; }
  for (const k of ['groups', 'stars', 'cats']) if (js.includes(`"${k}"`)) return {[k]:[]};
  if (js.includes('"name"')) return item('巡檢結果' + (++uid));
  return {desc:'重寫的介紹', rarity:2, tags:['物品'], color:'#446688'};
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: PHONE ? {width:390, height:844} : {width:1280, height:800}, acceptDownloads:true});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.type() === 'prompt' ? d.accept('巡檢改名') : d.accept());
  await p.addInitScript(([phone, save]) => {
    if (phone){ navigator.share = async () => {}; navigator.canShare = () => true; }
    if (!localStorage.getItem('wuxian_prefs')){ localStorage.setItem('wuxian_prefs', JSON.stringify({ai:'manual'})); localStorage.setItem('wuxian_save_v1', save); }
  }, [PHONE, JSON.stringify(SAVE)]);
  // 手動視窗一打開就自動回答
  let answering = false;
  const autoAnswer = async () => {
    if (answering) return; answering = true;
    try {
      for (let i = 0; i < 20; i++){
        const open = await p.$eval('#manual', e => e.classList.contains('open')).catch(() => false);
        if (!open) break;
        const pr = await p.$eval('#m-prompt', e => e.value);
        await p.fill('#m-answer', JSON.stringify(answerFor(pr)));
        await p.click('#m-ok'); await p.waitForTimeout(250);
      }
    } finally { answering = false; }
  };
  const closeAll = () => p.evaluate(() => { for (const id of ['modal', 'reorg', 'card']) document.getElementById(id).classList.remove('open'); });
  const results = [];
  const step = async (name, fn) => {
    const before = errs.length;
    try { await fn(); await autoAnswer(); await p.waitForTimeout(150); results.push([errs.length === before, name]); }
    catch(e){ const loc = (e.message.match(/waiting for (locator\([^\n]*\))/) || [])[1] || ''; results.push([false, `${name}（${e.message.split('\n')[0]} ${loc}）`]); }
    await closeAll();
  };
  // 設定有頁籤：要點的東西在別的頁籤時，先切過去
  const toTab = sel => p.evaluate(sel => { const el = document.querySelector(sel.replace(/ >> nth=\d+/, '').replace(/:has-text\([^)]*\)/, '')); const tab = el && el.closest('.stab');
    if (tab && tab.hidden) document.querySelector(`#set-tabs button[data-t="${tab.dataset.tab}"]`).click(); }, sel).catch(() => {});
  const tap = async sel => { await toTab(sel); try { await p.click(sel, {timeout:3000}); } catch(e){
    const info = await p.evaluate(sel => { const el = document.querySelector(sel.replace(/ >> nth=\d+/, '').replace(/:has-text\([^)]*\)/, '')); if (!el) return '找不到'; const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return `disabled=${el.disabled} hidden=${el.hidden || !el.offsetParent} 蓋住的是=${top && (top.id || top.className)}`; }, sel).catch(() => '');
    throw new Error(`點不到 ${sel}：${info}`); } };
  const clear = async () => { if (await p.$eval('#btn-clearslots', e => !e.disabled)) await tap('#btn-clearslots'); };
  const card = n => p.click(`#list .litem:has-text("${n}")`, {button:'right', timeout:3000});

  await step('開場', async () => { await p.goto(URL); await p.waitForTimeout(900); if (!(await p.$eval('#count', e => e.textContent))) throw new Error('清單沒出來'); });
  await step('合成（問 AI）', async () => { await tap('#list .litem:has-text("測試甲")'); await tap('#list .litem:has-text("測試乙")'); await tap('#btn-craft'); await p.waitForTimeout(300); });
  await step('真的嗎', async () => { await tap('#btn-really'); await p.waitForTimeout(300); });
  await step('內建配方合成', async () => { await clear(); await tap('#list .litem:has-text("水") >> nth=0'); await tap('#list .litem:has-text("火") >> nth=0'); await tap('#btn-craft'); });
  await step('配方小按鈕、上一步、下一步', async () => {
    const sl = () => p.$$eval('.slot', es => es.map(e => (e.querySelector('.nm') || {}).textContent || ''));
    if ((await sl()).some(Boolean)) throw new Error('合成完槽位沒清');
    const want = (await p.$eval('#r-eq button', e => e.textContent)).split(' ＋ ').map(x => x.replace(/^\S+ /, ''));
    await tap('#r-eq button');
    const a = await sl(); if (want.some(n => !a.includes(n))) throw new Error('配方沒放回槽位：' + a + ' 應該是 ' + want);
    await tap('#btn-slotundo'); if ((await sl()).some(Boolean)) throw new Error('上一步沒清回去');
    await tap('#btn-slotundo'); if (!(await sl()).includes(want[0])) throw new Error('再上一步應該回到合成前');
    await tap('#btn-slotredo'); if ((await sl()).some(Boolean)) throw new Error('下一步沒恢復');
  });
  await step('萃取', async () => { await clear(); await tap('#list .litem:has-text("測試甲")'); await tap('#btn-extract'); await p.waitForTimeout(300); });
  await step('隨機、釘子、清空', async () => {
    for (let i = 0; i < 30; i++){ await tap('#btn-random'); const s = await p.$$eval('.slot.filled .nm, .slot.filled', x => x.map(e => e.textContent)); if (new Set(s).size !== s.length) throw new Error('隨機抽到重複的'); }
    await tap('#btn-random'); await p.click('.slot .pin >> nth=0'); await tap('#btn-clearslots'); await p.click('.slot .pin >> nth=0'); await tap('#btn-clearslots'); });
  await step('舊存檔搬家（生物→動物、子分類清掉、內建的有多個標籤）', async () => {
    const s = await p.evaluate(() => JSON.parse(localStorage.getItem('wuxian_save_v1')));
    if (s.items['舊生物'].cat !== '動物') throw new Error('生物沒搬到動物');
    if (s.items['皮卡丘'].sub) throw new Error('子分類沒清掉');
    if (!(s.items['龍捲風'].tags || []).includes('災難')) throw new Error('內建圖鑑沒照新標籤');
  });
  await step('卡片、收藏、改三個標籤', async () => {
    await card('皮卡丘'); await tap('#c-fav'); await p.fill('#c-favname', '巡檢夾'); await tap('#c-favadd');
    await tap('#c-cat'); await p.fill('#c-tag2', '動漫'); await p.fill('#c-tag3', '動物'); await tap('#c-catok');
    if (!(await p.$eval('#c-cat', e => e.textContent)).includes('專有名詞・動漫・動物')) throw new Error('卡片沒顯示三個標籤');
    await tap('#c-redesc'); await p.waitForTimeout(300);
  });
  await step('卡片路線、刪除東西', async () => { await card('測試乙'); await tap('#c-del'); await p.waitForTimeout(200); });
  await step('搜尋、排序、篩選', async () => {
    await p.fill('#search', '水'); await p.waitForTimeout(300); await p.fill('#search', ''); await p.waitForTimeout(250);
    for (const v of await p.$$eval('#sort option', x => x.map(o => o.value))) await p.selectOption('#sort', v);
    await tap('#f-unext'); await tap('#f-unext');
    await tap('#cattabs .cattab:has-text("動漫")');
    if (!(await p.$('#list .litem:has-text("皮卡丘")'))) throw new Error('點「動漫」標籤沒看到皮卡丘');
    await tap('#cattabs .cattab:has-text("全部")');
    await p.fill('#search', '動漫'); await p.waitForTimeout(300);
    if (!(await p.$('#list .litem:has-text("皮卡丘")'))) throw new Error('搜尋標籤名字沒找到');
    await p.fill('#search', ''); await p.waitForTimeout(250);
    await tap('#cattabs .cattab:has-text("我的")'); await tap('#favtabs .cattab >> nth=0');
  });
  await step('找標籤', async () => {
    await tap('#cattabs .cattab:has-text("找標籤")'); await p.fill('#tf-q', '災'); await p.waitForTimeout(100); await tap('#tf-list .cattab >> nth=0');
    if (!(await p.$('#cattabs .cattab.on:has-text("災難")'))) throw new Error('找標籤點了沒選到');
    await tap('#cattabs .cattab:has-text("全部")');
  });
  await step('排除分類', async () => {
    await tap('#cattabs .cattab:has-text("全部")'); await tap('#cattabs .cattab:has-text("⊘")'); await tap('#cattabs .cattab:has-text("物品")'); await tap('#cattabs .cattab:has-text("⊘")');
    if (!(await p.$('.hidebar'))) throw new Error('排除後沒有提示列');
    await tap('.hidebar');
  });
  await step('多選加標籤、拿掉標籤、加收藏夾', async () => {
    if (await p.$('#favtabs .cattab.on')) await tap('#favtabs .cattab.on');  // 收藏夾篩選關掉
    await tap('#cattabs .cattab:has-text("全部")'); await tap('#btn-select'); await tap('#list .litem >> nth=0'); await tap('#list .litem >> nth=1');
    await tap('#sel-cat'); await tap('#sc-list .rg-row:has-text("音樂")');
    await tap('#btn-select'); await tap('#list .litem >> nth=0'); await tap('#list .litem >> nth=1');
    await tap('#sel-cat'); await tap('#sc-list .rg-row:has-text("音樂")');
    await tap('#btn-select'); await tap('#list .litem >> nth=0'); await tap('#sel-fav'); await tap('#pk-list .rg-row >> nth=0'); await tap('#sel-done').catch(() => {});
  });
  await step('目標本', async () => { await tap('#btn-goals'); await p.fill('#gl-name', '巡檢目標'); await tap('#gl-add'); await tap('#gl-list .gl-row button >> nth=0'); });
  await step('任務：自己打、AI 出題、接下、放棄', async () => {
    await tap('#btn-quests'); await p.fill('#qs-name', '巡檢任務'); await tap('#qs-add');
    await tap('#qs-ai'); await p.waitForTimeout(400); await autoAnswer(); await p.waitForTimeout(300);
    if ((await p.$$('#qs-pick .gl-row')).length !== 2) throw new Error('出題沒把已經有的「水」拿掉');
    await tap('#qs-pick .gl-row >> nth=0'); await tap('#qs-pick button:has-text("接下")');
    await tap('#qs-list .gl-row:has-text("巡檢任務") button');
    const s = await p.evaluate(() => JSON.parse(localStorage.getItem('wuxian_save_v1')));
    if (!s.quests || s.quests.on.length !== 1 || s.quests.on[0].name !== '巡檢題甲') throw new Error('任務沒存對：' + JSON.stringify(s.quests));
    if (!/0 日 0 時 0 分/.test(await p.$eval('#qs-list', e => e.textContent))) throw new Error('計時沒顯示');
    await tap('#qs-done .qs-fold').catch(() => {});
    if (await p.$eval('#qs-coins', e => e.offsetHeight > 0)) throw new Error('貨幣圖案沒收起來');
    await tap('#qs-coinpick'); if ((await p.$$('#qs-coins button')).length !== 30) throw new Error('貨幣圖案不是 30 個');
    await tap('#qs-coins button >> nth=21');
    if (!(await p.$eval('#qs-coin', e => e.textContent)).startsWith('🐱')) throw new Error('換貨幣圖案沒反應');
    await tap('#qs-close');
  });
  await step('管理標籤、新標籤', async () => {
    await tap('#btn-catorder'); await tap('#co-list .co-row button:has-text("↓") >> nth=0'); await tap('#co-list .co-row button:has-text("✎") >> nth=1'); await tap('#co-done');
    await tap('#cattabs .cattab:has-text("新標籤")'); await p.fill('#nc-name', '巡檢類'); await tap('#nc-add');
  });
  await step('整理（四項全勾，含提議新標籤）', async () => { await tap('#btn-reorg'); await p.check('#rg-star'); await p.check('#rg-newtag'); await tap('#rg-go'); await p.waitForTimeout(400); await autoAnswer();
    // 提議的新標籤、換標籤都會跳勾選視窗：全部照 AI 的
    for (let i = 0; i < 4; i++){ if (await p.$eval('#rg-review', e => !e.hidden && e.closest('#reorg').classList.contains('open')).catch(() => false)){ await tap('#rg-apply'); await p.waitForTimeout(300); await autoAnswer(); } }
    const s = await p.evaluate(() => JSON.parse(localStorage.getItem('wuxian_save_v1')));
    if (!s.userCats.includes('巡檢新標籤')) throw new Error('新標籤沒加進清單');
  });
  await step('整理：全部重新貼標籤', async () => { await tap('#btn-reorg'); await p.uncheck('#rg-items'); await p.uncheck('#rg-star'); await p.uncheck('#rg-newtag'); await p.check('#rg-recat'); await tap('#rg-go'); await p.waitForTimeout(400); await autoAnswer();
    if (await p.$eval('#rg-review', e => !e.hidden).catch(() => false)) await tap('#rg-apply'); });
  await step('統計', async () => { await tap('#btn-stats'); });
  await step('設定每個選項', async () => {
    await tap('#btn-settings');
    for (const seg of ['seg-theme', 'seg-font', 'seg-motion', 'seg-lite', 'seg-border', 'seg-fold', 'seg-folddays', 'seg-randdup', 'seg-temp']){
      await toTab('#' + seg); for (const btn of await p.$$(`#${seg} button`)) await btn.click(); }
    await toTab('#adv'); await p.click('#adv summary'); await tap('#adv-tpl .btn >> nth=2'); await tap('#adv-save');
  });
  let file = path.join(os.tmpdir(), 'xunjian.json');
  await step('下載存檔（連專案）', async () => {
    await tap('#btn-settings'); await toTab('#ex-labs'); await p.check('#ex-labs').catch(() => {});
    const [dl] = await Promise.all([p.waitForEvent('download'), tap('#btn-export')]); await dl.saveAs(file);
  });
  if (PHONE) await step('分享存檔', async () => { await tap('#btn-settings'); await tap('#btn-share'); });  // 電腦沒有分享功能，按鈕本來就藏起來
  await step('部分匯出', async () => { await tap('#btn-settings'); await tap('#btn-partial'); await p.check('#px-cats input >> nth=0'); const [dl] = await Promise.all([p.waitForEvent('download'), tap('#px-dl')]); });
  await step('實驗室：開專案、合成、編輯', async () => {
    await tap('#btn-lab'); await tap('#wl-new'); await p.fill('#nl-theme', '巡檢主題'); await tap('#nl-gen'); await autoAnswer(); await tap('#nl-start'); await p.waitForTimeout(300);
    await tap('#list .litem >> nth=0'); await tap('#list .litem >> nth=1'); await tap('#btn-craft');
    await p.waitForSelector('#manual.open', {state:'attached', timeout:3000});
    if (!(await p.$eval('#m-prompt', e => e.value)).includes('只能從這些選：巡檢角色、巡檢地點、巡檢道具')) throw new Error('專案的標籤沒給 AI');
    await autoAnswer();
    await tap('#btn-lab'); await tap('#wl-list .wl-row.here button:has-text("編輯")'); await p.fill('#el-prompt', '巡檢補充'); await tap('#el-save');
  });
  await step('實驗室：擋住的操作、回我的世界、併入、封存、還原', async () => {
    await tap('#btn-settings'); await tap('#btn-import'); await closeAll();
    await tap('#wb-home'); await p.waitForTimeout(200);
    await tap('#btn-lab'); await tap('#wl-list .wl-row:has-text("巡檢主題") button:has-text("併入")'); await tap('#fm-apply');
    await tap('#btn-lab'); await tap('#wl-list .wl-row:has-text("巡檢主題") button:has-text("封存")');
    await tap('#wl-list .foldbar'); await tap('#wl-list .wl-row:has-text("巡檢主題") button:has-text("還原")');
  });
  await step('合併朋友的存檔（含專案）', async () => {
    await tap('#btn-settings'); const [fc] = await Promise.all([p.waitForEvent('filechooser'), tap('#btn-merge')]); await fc.setFiles(file); await p.waitForTimeout(400);
    await tap('#fm-apply').catch(() => {});
  });
  await step('匯入存檔、復原', async () => {
    await tap('#btn-settings'); const [fc] = await Promise.all([p.waitForEvent('filechooser'), tap('#btn-import')]); await fc.setFiles(file); await p.waitForTimeout(400);
    await closeAll(); await tap('#btn-settings'); await tap('#btn-undo'); await p.waitForTimeout(300);
  });
  await step('自己設定東西（我的）', async () => {
    await tap('#cattabs .cattab:has-text("我的")'); await tap('#list .litem >> nth=0'); await p.fill('#mn-name', '巡檢我的'); await p.fill('#mn-desc', '我自己的'); await tap('#mn-save');
  });
  await step('重新整理後還正常', async () => { await p.reload(); await p.waitForTimeout(900); if (!(await p.$eval('#count', e => e.textContent))) throw new Error('清單沒出來'); });
  if (!PHONE) await step('電腦快捷鍵', async () => { for (const k of ['1', '2', 'Enter', 'Escape', 'r', 'Delete']) await p.keyboard.press(k); });

  const crash = await p.$eval('#crash', e => e.textContent).catch(() => '');
  for (const [ok, name] of results) console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (crash) console.log('錯誤訊息條：' + crash);
  console.log(errs.length ? '錯誤：\n  ' + [...new Set(errs)].join('\n  ') : '沒有錯誤');
  await b.close();
  process.exit(errs.length || results.some(r => !r[0]) ? 1 : 0);
})();
