const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildContext, writeCases } = require('../scripts/build.js');
// round 1 的三条裁定用到这四个导出口；单独成行是为了不动简报逐字给出的上面那行。
const { factsFor, techLabel, assertContext } = require('../scripts/build.js');
const { casePage } = require('../scripts/template.js');
/* ---- Task 10 追加的夹具（G3 要点条数对数 / G5 技术计数改为复算） ----
   SHIP 是交付物目录，默认 = 仓库里的 portfolio/（原本读的就是这批文件）。KX_SHIP_DIR 只用于
   判别力演示：把 11 份产物复制到临时目录、按评审实验那样改坏（h1→div、归档头行数字、联系改名），
   再指过来跑同一批断言，就能看到它们真的变红；正式跑测试从不设这个变量。 */
const { FEATURED } = require('../content/featured.js');
const { SITE } = require('../content/site.js');
const { esc } = require('../scripts/util.js');
const SHIP = process.env.KX_SHIP_DIR ? path.resolve(process.env.KX_SHIP_DIR) : path.resolve(__dirname, '..');

let sharedCtx; // buildContext 每次要扫全仓 + 约 90 次 git log（约 7 s），本文件各用例共用一份
const ctxOnce = () => sharedCtx || (sharedCtx = buildContext());
const readCase = (slug) => fs.readFileSync(path.join(SHIP, 'case', `${slug}.html`), 'utf8');
const readHome = () => fs.readFileSync(path.join(SHIP, 'index.html'), 'utf8');
/* 技术块改成纯个人内容（content/site.js 的 techStack，招聘口径的技术栈），不再有「来自 N 个项目」
   这类派生行，逐行对账的对象随之消失；这里只留要点区块的摘取器。 */
/* 要点区块要单独摘出来数条目：裸 `<span>` 在「技术」「模块」两栏里同样存在，
   「html 里有 <span>」证明不了要点非空（Task 7+8 评审 Important 3）。 */
const pointsBlockOf = (html) => (html.match(/<h2>要点<\/h2><div>(<ul class="plain">[\s\S]*?<\/ul>)<\/div><\/section>/) || [])[1] || '';
const itemsIn = (block) => (block.match(/<li>/g) || []).length;

/* TAP 噪声治理（final review 裁定「Ruling 噪声」）：下面那条 fail-loud 探针故意让 buildContext 去扫
   os.tmpdir()，scan.js 的 gitMeta 会对每个候选目录跑一次 `git log`，而 execFileSync 家族没显式给 stdio 时
   默认把子进程 stderr 透传到本进程（Node 的 ['ignore','pipe','inherit']）→ 约 33 行
   「fatal: not a git repository」，在人眼里像 33 个失败。
   这里只在那一次调用上把 stderr 收回管道：不改 scan.js（本修复波不碰它），也不吞异常 ——
   返回值原样传出，抛出的错原样上抛，断言的仍是「buildContext 必须抛错」这件事。 */
function withoutChildStderr(fn) {
  const cp = require('node:child_process');
  const original = cp.execFileSync;
  cp.execFileSync = (file, args, options) => original.call(cp, file, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  try { return fn(); } finally { cp.execFileSync = original; }
}
const cp = require('node:child_process');
const originalExecFileSync = cp.execFileSync; // 供「包装器必须还原」那条对照用（也证明上面拿到的确实是同一个模块对象）

/* 交付物与精选数据对数的三层断言：区块在 → 条数相等 → 每条文案逐字上屏。 */
function assertPointsMatch(html, points, label) {
  const block = pointsBlockOf(html);
  assert.ok(block, `${label} 的「要点」区块没渲染成预期的 ul 结构（要点为空）`);
  const n = itemsIn(block);
  assert.strictEqual(n, points.length, `${label} 要点渲染 ${n} 条，content/featured.js 里是 ${points.length} 条`);
  assert.ok(points.length >= 3, `${label} 的精选数据本身不足 3 条要点，这条对照不成立`);
  for (const p of points) {
    assert.ok(block.includes(`<span>${esc(p.text)}</span>`), `${label} 的要点「${p.text.slice(0, 16)}…」没逐字上屏`);
  }
}

test('10 个详情页全部生成且 slug 对应', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cases-'));
  const ctx = ctxOnce();
  const files = writeCases(ctx, tmp);
  assert.strictEqual(files.length, 10);
  for (const f of files) {
    const html = fs.readFileSync(path.join(tmp, f), 'utf8');
    assert.match(html, /class="case-study c-[a-z-]+"/, `${f} 缺 body class 或 accent 类`);
    assert.ok(html.includes('<h1 class="cs-title">'), `${f} 详情页缺 h1`);
    assert.ok(html.includes('href="../index.html"'), `${f} 缺返回链接`);
    assert.ok(html.includes('cs-meta'), `${f} 缺 meta 行`);
    assert.ok(!/undefined|NaN/.test(html), `${f} 含未替换变量`);
    // 要点非空按「要点区块里的 <li> 条数」证明，并与该 slug 的精选数据对数（原先只查有没有 <span>）
    assertPointsMatch(html, FEATURED.find((x) => `${x.slug}.html` === f).points, f);
  }
  assert.strictEqual(fs.readdirSync(tmp).filter((n) => n.endsWith('.html')).length, 10);
});

test('详情页要点数与精选数据一致', () => {
  const ctx = ctxOnce();
  for (const f of FEATURED) {
    const html = readCase(f.slug);
    const n = (html.match(/<ul class="plain">/g) || []).length;
    assert.ok(n >= 3, `${f.slug} 的要点/技术/模块三个区块未全渲染：${n}`);
    assert.ok(html.includes(f.name), `${f.slug} 缺项目名`);
    assertPointsMatch(html, f.points, `${f.slug}.html`);   // 与 content/featured.js 逐条对数
  }

  /* 判别力对照（评审 Important 3：这条断言名不副实了很久）：把一条真实精选数据在内存里删掉一个要点
     —— content/featured.js 不动 —— 生成页的要点条数必须跟着少一条，且上面那条对数断言必须报错。
     缺了这段，「渲染条数 == 源条数」可能两侧同时坏掉而无人察觉（例如计数器抓的是别的 ul）。 */
  const src = FEATURED[0];
  const doctored = { ...src, points: src.points.slice(0, -1) };
  const html = casePage({ feat: doctored, facts: factsFor(ctx.byDir.get(src.dir), doctored) });
  assert.strictEqual(itemsIn(pointsBlockOf(html)), src.points.length - 1,
    '对照失效：删掉一个要点后渲染条数没变，说明条数计数器量的不是要点区块');
  assert.throws(() => assertPointsMatch(html, src.points, '内存夹具（少一个要点）'),
    new RegExp(`要点渲染 ${src.points.length - 1} 条，content/featured\\.js 里是 ${src.points.length} 条`),
    '对照失效：源数据与渲染条数不一致时 assertPointsMatch 仍不报错');
});

test('未扫到的精选目录会让 buildContext 抛错', () => {
  // withoutChildStderr 只关掉子进程 stderr 的上屏（见文件顶部注释），抛错语义一字未改：
  // buildContext 不再 throw 时这条照样红（探针返回值被丢弃，assert.throws 认的是异常本身）。
  assert.throws(() => withoutChildStderr(() => require('../scripts/build.js').buildContext(os.tmpdir())), /精选项目未在仓库中扫到|扫描 0/);
  /* 对照：包装器不能把异常一起吞掉。① 包一层什么都不改的函数必须正常返回；
     ② 包一层真会抛的函数必须抛出原错；③ 用同一包装跑一次真实仓库，必须不抛 ——
     三条同时成立才说明「静音」只静音了 stderr，没有改动成败判定。 */
  assert.strictEqual(withoutChildStderr(() => 'sentinel'), 'sentinel', '对照失效：withoutChildStderr 把返回值吞了');
  assert.throws(() => withoutChildStderr(() => { throw new Error('哨兵异常'); }), /哨兵异常/, '对照失效：withoutChildStderr 把异常吞了');
  // ③ 收回 stderr 不能伤到 stdout —— gitMeta 吃的就是 stdout；取不到日期形状就说明包装打穿了取数路径
  const gitOut = withoutChildStderr(() => cp.execFileSync(
    'git', ['log', '-1', '--format=%ad', '--date=short'],
    { cwd: require('../scripts/scan-root.js').resolveScanRoot(), encoding: 'utf8' }));
  assert.match(gitOut.trim(), /^\d{4}-\d{2}-\d{2}$/, `对照失效：注入 stdio 后 execFileSync 的 stdout 取不到了：${JSON.stringify(gitOut)}`);
  assert.strictEqual(cp.execFileSync, originalExecFileSync, '对照失效：包装器没把 execFileSync 还原，噪声治理会污染后面的用例');
});

/* 简报三条之外的加固：详情页的 bodyClass 是 `case-study c-<slug>`（Task 6 裁定），
   样式表相对路径靠的是「首段等于 case-study」而非整串相等 —— 这条断了就是整站丢样式，
   而上面任何一条都测不到；顺带钉死「首页恰好一段内联脚本、详情页零 JavaScript」与生成标记这两个硬约束。 */
test('产物纯静态且样式表相对路径正确', () => {
  const home = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(home.startsWith('<!-- GENERATED BY scripts/build.js — 请勿手改 -->'), '首页首行缺生成标记');
  assert.match(home, /<link rel="stylesheet" href="css\/style\.css">/, '首页样式表路径不对');
  /* 契约：运行时 JS 只允许出现在首页，且恰好一段内联；脚本体形状受限。
     详情页那三条（零 JS / 样式表退一级 / 无外链）保持原样，不许跟着放松。 */
  const scripts = home.match(/<script/g) || [];
  assert.strictEqual(scripts.length, 1, `首页出现 ${scripts.length} 段 <script>，契约是恰好一段`);
  const inline = home.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(!/\ssrc\s*=/.test(inline), '首页内联脚本引了外部文件');
  assert.ok(!/eval|document\.write/.test(inline), '首页内联脚本含 eval/document.write');
  assert.ok(!/fetch\(|XMLHttpRequest/.test(home), '首页含网络请求调用');
  /* 「零外链」量的是浏览器会自动取用的资源。联系区块的 GitHub 是读者点一下才走的锚，
     file:// 下不点就没有任何请求，而且它在本次改造之前就在产物里 —— 把它算成缺陷等于
     让构建对个人内容表态。摘除只绑模板实际产出的那一个锚的形状（URL + rel + class + 文本一体），
     而不是任意 `<a href="http…">`：将来第二个外链锚（哪怕同形状换 URL）不会被顺手放过。
     其余位置（<link>、<script src>、<img src>、@import、url()）照旧全量扫。
     紧跟其后的对照证明摘除只摘得动那一个锚：同一条外链挪进 <link> 就必须还能咬。 */
  const GH_CONTACT_ANCHOR = `<a href="https://${esc(SITE.contact.github)}" rel="noopener noreferrer" class="hl">${esc(SITE.contact.github)}</a>`;
  const autoResource = (text) => text
    .replace(/<meta name="description"[^>]*>/, '')
    .replace(/<script>[\s\S]*?<\/script>/, '')
    /* 只摘**一份**（不是 split/join）：绑形状解决了「任意 <a> 被放过」，没解决
       「同一形状出现两次被全数放过」。份数由下面那条 strictEqual 钉死，摘除只摘第一份。 */
    .replace(GH_CONTACT_ANCHOR, '');
  assert.strictEqual(home.split(GH_CONTACT_ANCHOR).length - 1, 1,
    `GitHub 联系锚在首页出现的份数不是 1（实际 ${home.split(GH_CONTACT_ANCHOR).length - 1}）`
      + ' —— 同形锚多出来时摘除会把它一起抹掉，「零外链」就漏拦了');
  assert.ok(home.includes(GH_CONTACT_ANCHOR),
    `夹具失效：首页没有按模板形状出现 GitHub 联系锚，摘除逻辑量错了对象：${GH_CONTACT_ANCHOR}`);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)[^\s"]+/i.test(autoResource(home)),
    '首页脚本与 GitHub 锚之外含外部地址，file:// 下会发请求');
  assert.ok(/https?:\/\//.test(autoResource(
    home.replace('<link rel="stylesheet" href="css/style.css">',
      '<link rel="stylesheet" href="https://cdn.example.com/steal.css">'))),
    '对照失效：外链塞进 <link> 也被摘干净了，说明这条锁已经咬不住自动取用的资源');

  const { FEATURED } = require('../content/featured.js');
  for (const f of FEATURED) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'case', `${f.slug}.html`), 'utf8');
    assert.ok(html.startsWith('<!-- GENERATED BY scripts/build.js — 请勿手改 -->'), `${f.slug} 首行缺生成标记`);
    assert.match(html, /<link rel="stylesheet" href="\.\.\/css\/style\.css">/, `${f.slug} 的样式表没退一级目录，打开会丢全部样式`);
    assert.ok(!/<script|fetch\(|XMLHttpRequest/i.test(html), `${f.slug} 含 JavaScript`);
    assert.ok(!/https?:\/\/(?!www\.w3\.org)[^\s"]+/i.test(html.replace(/<meta name="description"[^>]*>/, '')),
      `${f.slug} 含外部地址，file:// 下会发请求`);
  }
});

/* ============ 评审 round 1 的三条裁定 ============
   下面四条用例各自钉一条修复，全部指向产物或纯函数的对外形状，不测实现细节。
   （夹具 ctxOnce/readCase 已提到文件顶部，与 Task 10 的新用例共用一份 ctx。） */

/* 裁定 1：同一页只能有一个项目名真相源。页头 .cs-company 用策展名（featured.js 的 name），
   概览句过去用 record.displayName（manifest.json 的 name），于是 灵猫健康服务/臻动力/一人一保
   三页的页头与概览各读一个名字。现在句首必须是页头那个名字，manifest 名与目录名降级为括注事实。
   final review M-1 再加一刀：括注只放「与已显示的那个名字不同」的事实 ——
   策展名 = manifest 名 = 目录名 时（拼豆小程序这类，10 页里有 6 页）整段省略，
   有差异时（蓝牙设备 vs 灵猫健康服务、目录名 港澳租车原新改）必须原样留在句子里。 */
test('详情页页头与概览句用同一个项目名，括注不重复已显示的名字', () => {
  const ctx = ctxOnce();
  let divergent = 0;
  let fullyRedundant = 0;
  for (const f of ctx.featuredReal) {
    const record = ctx.byDir.get(f.dir);
    const html = readCase(f.slug);
    const header = (html.match(/<span class="cs-company">([^<]*)<\/span>/) || [])[1];
    const summary = (html.match(/<h2>概览<\/h2><div><p>[^<]*<\/p><p class="muted">([^<]*)<\/p>/) || [])[1];
    assert.ok(header && summary, `${f.slug} 页头或概览句没按预期结构渲染`);
    assert.strictEqual(header, f.name, `${f.slug} 页头名字不是策展名`);
    assert.ok(summary.startsWith(f.name), `${f.slug} 概览句没以页头名字（${f.name}）开头，实际：${summary}`);
    const rest = summary.slice(f.name.length);
    const paren = rest.startsWith('（') ? rest.slice(0, rest.indexOf('）') + 1) : '';
    assert.ok(rest.startsWith('（') || rest.startsWith('：'), `${f.slug} 概览句名字后面既不是括注也不是冒号：${summary}`);
    assert.ok(summary.startsWith(`${f.name}${paren}：`), `${f.slug} 概览句不是「名字 + 括注 + 冒号」拼出来的：${summary}`);
    if (record.displayName !== f.name) {
      divergent++;
      assert.ok(paren.includes(`manifest 名 ${record.displayName}`), `${f.slug} 概览丢了 manifest 原名这个事实（它与策展名不同，必须留）`);
      assert.ok(!summary.startsWith(`${record.displayName}（`), `${f.slug} 概览仍以 manifest 名开头，两个真相源没合上`);
    } else {
      assert.ok(!paren.includes('manifest 名'), `${f.slug} manifest 名与策展名全等，括注里不该再打印一遍：${summary}`);
    }
    if (record.dir !== f.name) {
      assert.ok(paren.includes(`目录名 ${record.dir}`), `${f.slug} 概览丢了目录名这个事实（读者靠它找代码，且它与策展名不同）`);
    } else {
      assert.ok(!paren.includes('目录名'), `${f.slug} 目录名与策展名全等，括注里不该再打印一遍：${summary}`);
    }
    if (record.displayName === f.name && record.dir === f.name) {
      fullyRedundant++;
      assert.strictEqual(paren, '', `${f.slug} 三个名字全等却仍留着括注（M-1 的重复串）：${summary}`);
    }
  }
  assert.ok(divergent >= 3, `夹具里应有至少 3 个「manifest 名 ≠ 策展名」的项目才测得到这条裁定，实际 ${divergent}`);
  assert.ok(fullyRedundant >= 1, `夹具里应至少有一页三个名字全等（拼豆小程序），否则「省略括注」这条从未执行，实际 ${fullyRedundant}`);

  /* 判别力对照（纯内存，不依赖盘上产物）：同一 factsFor 走三种名字关系 —— 该省的省、该留的留。
     只有上面那圈产物断言的话，把 build.js 改回「无条件打印括注」要等重建才会红（G2 字节锁是第二道）。 */
  const synth = (name, displayName, dir) => factsFor({
    dir, displayName, kind: 'uniapp', pages: 10, subPackages: 0, pageTitles: ['首页'], signals: ['支付'], commits: 0, lastCommit: '',
  }, { name });
  assert.strictEqual(synth('拼豆小程序', '拼豆小程序', '拼豆小程序').summary, '拼豆小程序：10 个页面。',
    '三个名字全等时括注没省略（M-1 的三遍重复串又回来了）');
  assert.strictEqual(synth('灵猫健康服务', '蓝牙设备', '灵猫健康服务').summary, '灵猫健康服务（manifest 名 蓝牙设备）：10 个页面。',
    'manifest 名与策展名不同却被省掉了 —— 那是信息不是重复');
  assert.strictEqual(synth('港澳租车', '港澳租车', '港澳租车原新改').summary, '港澳租车（目录名 港澳租车原新改）：10 个页面。',
    '目录名与策展名不同却被省掉了 —— 读者靠它找代码');
});

/* 裁定 2 的存活部分：kind 不能以内部标识上屏。首页技术块已经改成人写的技术栈、不再有派生行，
   所以这条改钉详情页 —— 详情页的「技术」列在 signals 为空时会回落到形态标签。 */
test('扫描到的每种形态都登记了人读标签，详情页不会出现 native-wx 这类内部标识', () => {
  const ctx = ctxOnce();
  const kinds = [...new Set(ctx.records.map((r) => r.kind))];
  assert.ok(kinds.length >= 5, `扫描到的形态种类异常（${kinds.join('/')}），这条用例的覆盖面不成立`);
  for (const kind of kinds) assert.notStrictEqual(techLabel(kind), kind, `形态 ${kind} 未登记中文标签，会原样上屏`);
  const cases = FEATURED.map((f) => readCase(f.slug)).join('');
  for (const kind of kinds) assert.ok(!cases.includes(`<span>${kind}</span>`), `详情页技术列含原始形态标识 ${kind}`);
});

/* final review I-1 的口径仍然成立，只是宿主从技术块换成了页面描述：
   首页 <meta description> 那句「N 个小程序与 H5 项目」必须用合并后的项目数，不是扫描目录数。
   对照写在这里：今天目录数（90）与项目数（81）不相等，写错成 records.length 会立刻红。 */
test('页面描述里的项目数用合并口径，不是扫描目录数', () => {
  const ctx = ctxOnce();
  const home = readHome();
  assert.ok(ctx.records.length > ctx.stats.projects,
    `对照不成立：目录数 ${ctx.records.length} 与项目数 ${ctx.stats.projects} 相等，这条测不到口径`);
  assert.ok(home.includes(`${ctx.stats.projects} 个小程序与 H5 项目`),
    `页面描述没用合并口径的项目数（应为 ${ctx.stats.projects}，目录数是 ${ctx.records.length}）`);
  assert.ok(!home.includes(`${ctx.records.length} 个小程序与 H5 项目`), '页面描述把目录数当成了项目数');
});

/* 技术栈是个人内容（招聘口径的技术栈，不跟项目走），build.js 只保证形状：
   分组有名、条目是非空字符串。四种坏法都要报出来，否则漏引号或写成对象会静默渲染成 [object Object]。 */
test('assertContext 拦下形状不对的技术栈', () => {
  const ctx = ctxOnce();
  const withStack = (stack) => ({ ...ctx, site: { ...ctx.site, techStack: stack } });
  assert.doesNotThrow(() => assertContext(withStack(SITE.techStack)), '真实技术栈没过门槛');
  const cases = [
    ['空分组', [{ name: '缺条目', items: [] }], /是空的/],
    ['缺分组名', [{ name: '', items: ['某条目'] }], /缺分组名/],
    ['条目不是字符串', [{ name: '组', items: [{ text: '某条目' }] }], /不是非空字符串/],
    ['整块为空', [], /techStack 为空/],
  ];
  for (const [name, stack, re] of cases) {
    assert.throws(() => assertContext(withStack(stack)), re, `对照失效：技术栈「${name}」没有被拦下`);
  }
});

/* 详情页的技术列在 signals 为空时回落到项目形态，这是第二个产 label 的地方：同样必须是中文标签，
   且回落路径在产物里测不到（10 个精选都有 signals），所以用合成记录 + 真模板测。 */
test('详情页技术列回落到的也是人读的形态标签', () => {
  const feat = { monogram: '国', name: '国学小程序', oneLine: '一句话描述', slug: 'demo', points: [] };
  const facts = factsFor({
    dir: 'guoxue', displayName: 'guoxue', kind: 'native-wx', pages: 12, subPackages: 0,
    pageTitles: ['章节列表'], signals: [], commits: 0, lastCommit: '2025-01-01',
  }, feat);
  assert.deepStrictEqual(facts.signals, ['原生微信小程序'], 'signals 为空时回落到了原始 kind');
  const block = (casePage({ feat, facts }).match(/<h2>技术<\/h2><div>([\s\S]*?)<\/div><\/section>/) || [])[1] || '';
  assert.ok(block, '详情页技术列没渲染成预期的 ul 结构');
  assert.ok(block.includes('原生微信小程序') && !block.includes('native-wx'), `详情页技术列：${block}`);
  // 概览句同样以策展名开头（factsFor 的第二个入参参与构造）
  assert.ok(facts.summary.startsWith('国学小程序（manifest 名 guoxue，目录名 guoxue）：'), facts.summary);
});

/* 裁定 3：模块列表截断到 16 条时必须说明，未截断（含恰好 16 条）时不多写这句。 */
test('模块截断有说明、未截断不多写（合成两分支）', () => {
  const mk = (n) => casePage({
    feat: { monogram: '测', name: '测试项目', oneLine: '一句话描述', slug: 'demo', points: [] },
    facts: {
      pages: n, subPackages: 0, category: 'other', lastCommit: '—', signals: ['uni-app'],
      pageTitles: Array.from({ length: n }, (_, i) => `模块${i + 1}`), summary: '测试项目：概览句。',
    },
  });
  const itemsOf = (html) => (html.match(/<h2>模块<\/h2><div>(?:<p class="stats">[^<]*<\/p>)?(<ul class="plain">.*?<\/ul>)<\/div><\/section>/) || ['', ''])[1];
  const countItems = (html) => (itemsOf(html).match(/<li>/g) || []).length;

  const cut = mk(20);
  assert.ok(/<h2>模块<\/h2><div><p class="stats">共 20 个页面标题，示例 16 个<\/p>/.test(cut), `截断时缺说明：${cut.match(/<h2>模块<\/h2>.{0,80}/)[0]}`);
  assert.strictEqual(countItems(cut), 16, '截断后仍列了多于 16 条');

  for (const n of [16, 15, 1]) {
    const ok = mk(n);
    assert.ok(!/共 \d+ 个页面标题/.test(ok), `未截断（${n} 条）却写了说明`);
    assert.strictEqual(countItems(ok), n, `${n} 条应全部列出`);
  }
  assert.ok(!/<h2>模块<\/h2>/.test(mk(0)), '零标题时模块区块不该出现');
});

test('产物里每个详情页的模块说明与实际截断情况一致', () => {
  const ctx = ctxOnce();
  let cut = 0;
  for (const f of ctx.featuredReal) {
    const { pageTitles } = factsFor(ctx.byDir.get(f.dir), f);
    const html = readCase(f.slug);
    const block = (html.match(/<h2>模块<\/h2><div>(<p class="stats">[^<]*<\/p>)?(<ul class="plain">.*?<\/ul>)<\/div><\/section>/) || [])[0];
    assert.ok(block, `${f.slug} 模块区块结构异常`);
    const note = (block.match(/<p class="stats">([^<]*)<\/p>/) || [])[1];
    const listed = (block.match(/<li>/g) || []).length;
    if (pageTitles.length > 16) {
      cut++;
      assert.strictEqual(note, `共 ${pageTitles.length} 个页面标题，示例 16 个`, `${f.slug} 有 ${pageTitles.length} 条标题却没写截断说明`);
      assert.strictEqual(listed, 16, `${f.slug} 说明写了 16 条，实际列了 ${listed} 条`);
    } else {
      assert.ok(!note, `${f.slug} 只有 ${pageTitles.length} 条标题，不该有截断说明：${note}`);
      assert.strictEqual(listed, pageTitles.length, `${f.slug} 列出的条数与标题数不符`);
    }
  }
  assert.ok(cut >= 5, `当前 10 页里应有至少 5 页发生截断才测得到这条裁定，实际 ${cut}`);
});

test('产物引用的本地资源必须真实存在（图形、样式表都算）', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const pages = ['index.html', ...fs.readdirSync(path.join(root, 'case')).map((c) => 'case/' + c)];
  let checked = 0;
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const ref = m[1];
      if (/^(https?:|data:|mailto:|#)/.test(ref)) continue;
      const abs = path.resolve(path.dirname(path.join(root, page)), ref);
      assert.ok(fs.existsSync(abs), `${page} 引用了不存在的资源：${ref}`);
      checked++;
    }
  }
  assert.ok(checked >= pages.length * 2, `只核到 ${checked} 条本地引用，说明抓取或产物本身出了问题`);
});

/* 浏览器里跑的那段必须就是 require 到的那份源码（去掉导出）。
   漂了的形态是：有人改了 shark-motion.js 没重建，或反过来在模板里另抄一份。 */
test('首页内联的鲨鱼脚本与 shark-motion.js 源码同源', () => {
  const { sharkMotionSource } = require('../scripts/build.js');
  const src = sharkMotionSource();
  const home = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const inline = (home.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  assert.ok(src.length > 500, `夹具异常：内联源码只有 ${src.length} 字节`);
  assert.ok(inline.includes(src), '首页内联脚本不含 shark-motion.js 的当前源码（改了没重建，或模板另抄了一份）');
  assert.throws(() => {
    const fsx = require('node:fs');
    const real = fsx.readFileSync.bind(fsx);
    fsx.readFileSync = (p, e) => (String(p).endsWith('shark-motion.js')
      ? 'const a = 1;\nmodule.exports = { a };\nmodule.exports = { a };\n' : real(p, e));
    try { return require('../scripts/build.js').sharkMotionSource(); }
    finally { fsx.readFileSync = real; }
  }, /module\.exports/, '对照失效：两处 module.exports 没被拦住，会静默少一段代码');
});
