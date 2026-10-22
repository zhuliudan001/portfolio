/* Task 10 门槛测试（G1 assertContext 覆盖 / G2 交付物逐字节锁 / G6 meta 分包口径）。
   三条都来自评审的「测试拦不住」清单：
   - G1（Task 7+8 评审 Important 1）：assertContext 是无障碍与形状门槛，但 tests/ 里零引用 ——
     把它改回首错即抛、或删掉 build.js:144 那次调用，全 suite 照样绿。
   - G2（同评审 Important 2）：结构断言跑在 tmp 里新生成的文件上，不跑在交付物上；
     评审把产物副本的 h1 改成 div、归档头行数字改掉、联系区块改名，10/10 仍绿。
   - G6（同评审 Minor 1）：详情页 meta 行的「0 分包」与概览句的零值守卫是两套口径。
   只在内存/临时目录里做植入与篡改，content/、scripts/、css/、index.html、case/ 全程不写。 */
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildContext, assertContext, writeCases, factsFor } = require('../scripts/build.js');
const { homePage, casePage } = require('../scripts/template.js');
const { FEATURED } = require('../content/featured.js');

/* 交付物目录：默认就是仓库里的 portfolio/。KX_SHIP_DIR 只是判别力演示的钩子 —— 把 11 份产物复制到
   临时目录、按评审实验那样改坏，再指过来跑同一批断言，就能看到它们真的变红；正式跑测试从不设它。 */
const PORTFOLIO = path.resolve(__dirname, '..');
const SHIP = process.env.KX_SHIP_DIR ? path.resolve(process.env.KX_SHIP_DIR) : PORTFOLIO;
const BUILD_SCRIPT = path.join(PORTFOLIO, 'scripts', 'build.js');
const SHIPPED = ['index.html', ...FEATURED.map((f) => path.join('case', `${f.slug}.html`))];

let sharedCtx; // buildContext 要扫全仓 + 约 90 次 git log（约 7 s），本文件各用例共用一份
const ctxOnce = () => sharedCtx || (sharedCtx = buildContext());
const readShip = (rel) => fs.readFileSync(path.join(SHIP, rel), 'utf8');
const metaOf = (html) => (html.match(/<span class="cs-meta">([^<]*)<\/span>/) || [])[1] || '';
const shipSnapshot = () => SHIPPED.map((rel) => [rel, fs.readFileSync(path.join(SHIP, rel))]);
const sameShip = (before) => shipSnapshot().every(([rel, buf], i) => rel === before[i][0] && buf.equals(before[i][1]));

/* ============ G1：assertContext 覆盖 ============ */

test('assertContext 把全部失败聚合成一次抛出，而不是停在第一条（合成坏 ctx）', () => {
  // 正向对照：真 ctx 必须过门槛，否则下面的「报错」就成了怎么喂都红。
  assert.doesNotThrow(() => assertContext(ctxOnce()), '真实 ctx 都过不了门槛，聚合对照就没有意义');

  const bad = {
    featured: [],                                     // → 精选应恰好 10 条
    byDir: new Map(),                                  // → FEATURED 十条各报一条「未扫到」
    stats: {},                                         // → 页面描述的项目总数缺参照
    site: Object.assign({}, ctxOnce().site, {          // → 技术栈四条形状问题
      techStack: [
        { name: '', items: [] },
        { name: '测试组', items: [{ text: '写成对象的一条' }, '', 'uni-app 一套代码多端交付'] },
      ],
    }),
  };
  let err = null;
  try { assertContext(bad); } catch (e) { err = e; }
  assert.ok(err, 'assertContext 对坏 ctx 没有报错');
  const listed = err.message.split('\n').slice(1).map((s) => s.trim()).filter(Boolean);
  assert.ok(listed.length >= 15, `聚合清单只有 ${listed.length} 条（期望 ≥15）—— 门槛像是被改回「首错即抛」了`);
  // 首、中、末三段都要在同一份清单里：只报第一条就测不到后面这些
  for (const frag of ['精选应恰好 10 条', '飞鹰传媒 未扫到', '水利地图 未扫到',
    'stats.projects 缺失', '技术栈缺分组名', '是空的', '不是非空字符串']) {
    assert.ok(err.message.includes(frag), `聚合清单里没有「${frag}」：断言在它之前就中止了`);
  }
  assert.ok(err.message.startsWith('断言失败:'), `抛出文案没按「断言失败:」聚合：${err.message.slice(0, 40)}`);
});

test('assertContext 对 accent/monogram/slug 故障同样逐条累积（内存植入，用完立刻还原）', () => {
  const ctx = ctxOnce();
  const snapshot = FEATURED.map((f) => JSON.stringify(f));
  const patches = [];
  const patch = (obj, key, val) => { patches.push([obj, key, obj[key]]); obj[key] = val; };
  let err = null;
  try {
    patch(FEATURED[0].accent, 'light', '#ffffff');   // 浅色 accent 对白底 1.00
    patch(FEATURED[1].accent, 'dark', '#0e0e0e');    // 深色 accent 对 #0e0e0e 1.00
    patch(FEATURED[2], 'slug', 'Bad Slug');          // slug 形状非法（未过 esc 就进 class 名）
    patch(FEATURED[3], 'monogram', '错');             // 与展示名首字不符
    try { assertContext(ctx); } catch (e) { err = e; }
  } finally {
    for (const [obj, key, val] of patches.reverse()) obj[key] = val;
  }
  assert.deepStrictEqual(FEATURED.map((f) => JSON.stringify(f)), snapshot, '植入夹具没还原，content/featured.js 的内存副本被改坏了');
  assert.ok(err, '植入 4 类坏数据后 assertContext 没报错');
  const listed = err.message.split('\n').slice(1).map((s) => s.trim()).filter(Boolean);
  assert.ok(listed.length >= 4, `只聚合成 ${listed.length} 条：四处故障应当逐条列全`);
  for (const [frag, who] of [['浅色 accent 对比度', '飞鹰传媒'], ['深色 accent 对比度', '西有空间'],
    ['slug 形状非法', '生鲜积分商城'], ['monogram 与展示名首字不符', '灵猫健康服务']]) {
    assert.ok(listed.some((l) => l.includes(who) && l.includes(frag)), `清单缺「${who} ${frag}」一条`);
  }
});

/* 门槛在写盘之前才有意义，所以顺序也要钉死：主块里 assertContext 必须先于任何写盘调用。 */
function mainBlock(src) {
  const i = src.indexOf('if (require.main === module)');
  assert.ok(i >= 0, 'build.js 里没有 require.main 主块，顺序断言失去对象');
  return src.slice(i);
}
function assertGuardOrder(block) {
  const guard = block.search(/\bassertContext\s*\(/);
  assert.ok(guard >= 0, 'CLI 主块里没有调用 assertContext —— 无障碍与形状门槛被删了，坏数据会直接上屏');
  const at = [];
  for (const re of [/fs\.writeFileSync\s*\(/g, /\bwriteCases\s*\(/g]) {
    for (let m = re.exec(block); m; m = re.exec(block)) at.push(m.index);
  }
  assert.ok(at.length >= 2, `主块里的写盘调用少于 2 处（index.html 与 case/），这条顺序断言就成了恒真：${at.length}`);
  const first = Math.min(...at);
  assert.ok(guard < first, `门槛必须在写盘之前：assertContext 在第 ${guard} 字符，首个写盘在第 ${first} 字符`);
}

test('build.js 主块：assertContext 先于任何写盘（源码顺序锁 + 两种删挪变异对照）', () => {
  const block = mainBlock(fs.readFileSync(BUILD_SCRIPT, 'utf8'));
  assertGuardOrder(block);
  assert.throws(() => assertGuardOrder(block.replace(/\n[ \t]*assertContext\(ctx\);/, '')),
    /没有调用 assertContext/, '对照失效：把门槛整行删掉，顺序断言照样过');
  const moved = block.replace(/\n[ \t]*assertContext\(ctx\);/, '')
    .replace(/(fs\.writeFileSync\([^;]*\);)/, '$1\n  assertContext(ctx);');
  assert.ok(moved.includes('assertContext(ctx)') && moved.indexOf('assertContext(ctx)') > moved.indexOf('fs.writeFileSync'),
    '对照失效：门槛没被挪到 index.html 写盘之后，这条对照没做实');
  assert.throws(() => assertGuardOrder(moved), /门槛必须在写盘之前/,
    '对照失效：门槛挪到写盘之后，顺序断言照样过');
});

/* 行为层实测：以 --require 预加载脚本把真实 CLI 的 fs.writeFileSync 换成记账器（子进程不落任何盘），
   再按 env 决定要不要把 content/featured.js 换成植入坏数据的内存副本（require.cache 顶包，源文件不动）。
   同一次用例里跑「坏数据」与「好数据」两遍：好数据记到 11 次写盘，坏数据记到 0 次 ——
   上一条用例的「0 写盘」因此不是恒真，而是门槛真的拦住了。 */
test('CLI 守护：断言失败时非 0 退出、一处不写；同一记录器在数据合规时记到 11 次写盘', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-cli-'));
  const logPath = path.join(dir, 'writes.json');
  const preloadPath = path.join(dir, 'preload.cjs');
  const featuredMod = require.resolve(path.join(PORTFOLIO, 'content', 'featured.js'));
  fs.writeFileSync(preloadPath, [
    'const fs = require("fs");',
    `const LOG = ${JSON.stringify(logPath)};`,
    `const FEATURED_MOD = ${JSON.stringify(featuredMod)};`,
    'const realWrite = fs.writeFileSync;',
    'const writes = [];',
    'fs.writeFileSync = function (p) { writes.push(String(p)); };',
    'process.on("exit", function () { realWrite(LOG, JSON.stringify(writes), "utf8"); });',
    'if (process.env.KX_GATE_BAD) {',
    '  const doctored = JSON.parse(JSON.stringify(require(FEATURED_MOD)));',
    '  doctored.FEATURED[0].accent.light = "#ffffff";',
    '  doctored.FEATURED[1].accent.dark = "#0e0e0e";',
    '  doctored.FEATURED[2].slug = "Bad Slug";',
    '  require.cache[FEATURED_MOD] = { id: FEATURED_MOD, filename: FEATURED_MOD, loaded: true, exports: doctored, paths: [] };',
    '}',
  ].join('\n'), 'utf8');

  const before = shipSnapshot();
  const run = (bad) => {
    const res = cp.spawnSync(process.execPath, ['--require', preloadPath, BUILD_SCRIPT], {
      encoding: 'utf8', env: Object.assign({}, process.env, bad ? { KX_GATE_BAD: '1' } : {}), timeout: 300000,
    });
    assert.ifError(res.error, `子进程没跑起来：${res.error && res.error.message}`);
    return { res, writes: JSON.parse(fs.readFileSync(logPath, 'utf8')) };
  };
  try {
    const bad = run(true);
    assert.notStrictEqual(bad.res.status, 0, '门槛失效：带着坏数据 CLI 仍以 0 退出');
    assert.match(bad.res.stderr, /断言失败:/, `CLI 没按聚合清单失败：${bad.res.stderr.slice(0, 200)}`);
    for (const frag of ['浅色 accent 对比度', '深色 accent 对比度', 'slug 形状非法']) {
      assert.ok(bad.res.stderr.includes(frag), `CLI 的聚合清单缺「${frag}」—— 子进程里也只报了第一条？`);
    }
    assert.ok(bad.res.stderr.includes('assertContext'), 'CLI 的失败栈里没有 assertContext，报错来源可疑');
    assert.deepStrictEqual(bad.writes, [], `门槛拦不住写盘：CLI 在断言失败后仍写了 ${bad.writes.length} 个文件`);
    assert.ok(!bad.res.stdout.includes('已生成'), 'CLI 打印了「已生成」，说明它走完了写盘分支');

    // 对照组：数据合规时同一套夹具必须记到 11 次写盘（否则上面那个 0 毫无意义）
    const good = run(false);
    assert.strictEqual(good.res.status, 0, `对照组没跑通：${good.res.stderr.slice(0, 300)}`);
    assert.deepStrictEqual(
      good.writes.map((w) => path.relative(PORTFOLIO, w).split(path.sep).join('/')).sort(),
      SHIPPED.map((rel) => rel.split(path.sep).join('/')).sort(), '对照组的写盘清单与交付物清单不一致，记录器或 CLI 变了形态');
    assert.strictEqual(sameShip(before), true, '本用例自己改动了交付物：子进程的写盘没被记录器接住');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ============ G2：交付物逐字节锁 ============ */

const firstDiff = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};
const around = (buf, i) => Buffer.from(buf).slice(Math.max(0, i - 40), i + 80).toString('utf8').replace(/\s+/g, ' ');

test('盘上 11 份产物与重新生成的结果逐字节一致（幂等 + 交付物结构锁）', () => {
  const ctx = ctxOnce();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-ship-'));
  const files = writeCases(ctx, tmp);
  fs.writeFileSync(path.join(tmp, 'index.html'), homePage(ctx), 'utf8');
  assert.strictEqual(files.length, FEATURED.length, '生成的详情页数量与精选条目数不符');

  const generated = new Map([['index.html', fs.readFileSync(path.join(tmp, 'index.html'))]]);
  for (const f of files) generated.set(path.join('case', f), fs.readFileSync(path.join(tmp, f)));
  assert.strictEqual(generated.size, SHIPPED.length, '生成清单与交付清单数量不同');

  for (const rel of SHIPPED) {
    const gen = generated.get(rel);
    const ship = fs.readFileSync(path.join(SHIP, rel));
    assert.ok(gen.length > 200, `${rel} 的生成结果短得可疑：${gen.length} 字节`);
    const i = firstDiff(gen, ship);
    assert.ok(gen.equals(ship),
      `${path.join(SHIP, rel)} 与重新生成的结果在第 ${i} 字节分叉（交付物是生成物：手改 HTML、或改了模板没重建都会走到这里）\n`
      + `  生成：${around(gen, i)}\n  盘上：${around(ship, i)}`);
  }
  assert.deepStrictEqual(fs.readdirSync(path.join(SHIP, 'case')).filter((n) => n.endsWith('.html')).sort(),
    FEATURED.map((f) => `${f.slug}.html`).sort(), 'case/ 目录里有孤儿文件或缺文件');

  /* 判别力对照（评审实验 A4/A6）：逐字节比对必须分辨得出「h1 改成 div」和「精选行的页数被改」。
     分辨不出来说明比的是同一段生成文本（恒真），而不是盘上交付物。
     页数由 scan.js 现算并写进 ctx.featured，不写死数字 —— 写死就又犯 G5 那条快照式脆弱的错。 */
  const home = readShip('index.html');
  const headLine = `<span class="role">${ctx.featured[0].meta}</span>`;
  assert.ok(home.includes(headLine), `对照失效：盘上首页没有扫描派生的精选行元信息「${headLine}」`);
  const tamperedMeta = ctx.featured[0].meta.replace(/(\d+) 页/, (m, d) => `${Number(d) + 10} 页`);
  assert.notStrictEqual(tamperedMeta, ctx.featured[0].meta, '对照失效：页数没被改动，A6 实验根本没做实');
  const homeTampered = Buffer.from(home.replace(headLine, `<span class="role">${tamperedMeta}</span>`), 'utf8');
  assert.ok(!generated.get('index.html').equals(homeTampered), '对照失效：页数改掉后仍判为「逐字节一致」');

  const caseRel = path.join('case', `${FEATURED[0].slug}.html`);
  const caseText = readShip(caseRel);
  const caseTampered = Buffer.from(caseText.replace('<h1 class="cs-title">', '<div class="cs-title">'), 'utf8');
  assert.notStrictEqual(caseTampered.toString('utf8'), caseText, '对照失效：详情页没有 h1.cs-title，A4 实验根本没做实');
  assert.ok(!generated.get(caseRel).equals(caseTampered), '对照失效：h1→div 后仍判为「逐字节一致」');

  const stale = SHIPPED.filter((rel) => !generated.has(rel));
  assert.deepStrictEqual(stale, [], `交付清单里有、生成清单里没有的文件：${stale.join(', ')}`);
  fs.rmSync(tmp, { recursive: true, force: true }); // 临时目录用完即清（写在 os.tmpdir，不碰 portfolio）
});

test('交付物自身的结构断言（跑在盘上的 11 份上，不跑在 tmp 副本上）', () => {
  const ctx = ctxOnce();
  const home = readShip('index.html');
  for (const label of ['关于', '近期', '精选项目', '经历', '技术', '联系']) {
    assert.ok(home.includes(`<h2>${label}</h2>`), `盘上首页缺区块「${label}」（评审实验 A7：把「联系」改名当时全绿）`);
  }
  assert.ok(!home.includes('<h2>全部项目</h2>'), '盘上首页仍渲染归档模块（已按用户要求移除）');
  /* 技术栈是个人内容（content/site.js），这里只保证盘上产物与站点数据一一对应：
     分组标题与每条说法都要在，漏渲染或手改产物都会在这里红。 */
  const stack = ctx.site.techStack;
  assert.ok(stack.length >= 3, `夹具异常：技术栈只剩 ${stack.length} 组`);
  for (const g of stack) {
    assert.ok(home.includes(`<p class="group">${g.name}</p>`), `盘上首页缺技术栈分组标题「${g.name}」`);
    for (const item of g.items) {
      assert.ok(home.includes(`<span>${item}</span>`), `盘上首页缺技术栈条目「${item}」`);
    }
  }
  assert.ok(!/来自 \d+ 个项目/.test(home), '盘上首页仍有扫描计数的技术行（技术块应为人写的技术栈）');
  assert.strictEqual((home.match(/<li><a href="case\//g) || []).length, FEATURED.length, '盘上首页的精选链接数不等于精选条数');

  for (const f of FEATURED) {
    const html = readShip(path.join('case', `${f.slug}.html`));
    assert.ok(html.includes('<h1 class="cs-title">'), `${f.slug} 盘上产物没有 h1.cs-title（§11 语义结构）`);
    assert.ok(html.includes(`<body class="case-study c-${f.slug}">`), `${f.slug} 盘上产物的 body accent 类不对`);
    assert.ok(html.includes('href="../index.html"'), `${f.slug} 盘上产物缺返回链接`);
  }
});

/* ============ G6：meta 行的分包口径 ============ */

/* Task 7+8 评审 Minor 1：详情页 meta 行（template.js:103）无条件写 `${subPackages} 分包`，
   而同页概览句（build.js:122）有零值守卫 —— 同一事实两套口径，评审实测 5 个精选页上屏「… · 0 分包 · …」。
   裁定：统一到概览那句的做法，分包为 0 就不写这一项。
   曾以 todo 挂着（本任务只落断言、不改 scripts/，它会跑、会红，但 node:test 把 todo 的失败计入 # todo 而不是 # fail）；
   template.js 的 meta 串补上零值守卫后 todo 已摘掉，断言本身一字未动。 */
test('详情页 meta 行不再出现「0 分包」（G6：scripts/template.js 的零值守卫已生效）', () => {
  const ctx = ctxOnce();
  const withZero = FEATURED
    .map((f) => ({ f, facts: factsFor(ctx.byDir.get(f.dir), f) }))
    .filter((x) => x.facts.subPackages === 0);
  assert.ok(withZero.length >= 1, '对照不成立：当前没有分包为 0 的精选项目，这条断言测不到东西');

  for (const { f, facts } of withZero) {
    const html = casePage({ feat: f, facts }); // 纯内存生成，不写盘
    assert.ok(!/·\s*0 分包/.test(metaOf(html)),
      `分包为 0 时 meta 行仍写「0 分包」：${metaOf(html)}（概览句同事实却省略了它，两套口径应统一到省略）`);
  }
  for (const f of FEATURED) {
    assert.ok(!/·\s*0 分包/.test(metaOf(readShip(path.join('case', `${f.slug}.html`)))),
      `${f.slug} 盘上产物的 meta 行含「0 分包」`);
  }
});
