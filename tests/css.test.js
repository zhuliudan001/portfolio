const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { FEATURED } = require('../content/featured.js');

const css = fs.readFileSync(require.resolve('../css/style.css'), 'utf8');

test('核心 token 与参考站一致（中文三处调整除外）', () => {
  for (const t of ['--bg:#fff', '--fg:#111', '--muted:#767676', '--rule:#e6e6e6', '--label:88px']) {
    assert.ok(css.replace(/\s+/g, '').includes(t), `缺 token ${t}`);
  }
  for (const t of ['--bg:#0e0e0e', '--fg:#ececec', '--muted:#8e8e8e', '--rule:#262626']) {
    assert.ok(css.replace(/\s+/g, '').includes(t), `缺深色 token ${t}`);
  }
  assert.ok(/max-width:\s*760px/.test(css));
  assert.ok(/font-weight:\s*450/.test(css));
  assert.ok(/line-height:\s*1\.7/.test(css));
  assert.ok(/PingFang SC/.test(css) && /Microsoft Yahei/.test(css));
});

test('每个精选 slug 都有浅色与深色 accent 规则', () => {
  for (const f of FEATURED) {
    assert.ok(css.includes(`.c-${f.slug}`), `缺 .c-${f.slug}`);
    assert.ok(css.includes(f.accent.light), `缺 .c-${f.slug} 浅色值 ${f.accent.light}`);
    assert.ok(css.includes(f.accent.dark), `缺 .c-${f.slug} 深色值 ${f.accent.dark}`);
  }
});

test('悬停效果限定在可精确指针的设备', () => {
  assert.ok(/@media \(hover: hover\) and \(pointer: fine\)/.test(css));
  const reset = css.match(/\.index a:hover[^{]*\{[^}]*color:\s*inherit\s*;?\s*\}/);
  assert.ok(reset && reset[0].includes('.title'), '悬停反白的 muted 列重置未覆盖 .title（≤640px 下它会落在 accent 上只剩 1.1–1.3:1）');
});

test('存在响应式与打印断点', () => {
  assert.ok(/@media \(max-width: 640px\)/.test(css));
  assert.ok(/@media print/.test(css));
});

/* ============ Task 10 门槛（G4）：把「存在性剧场」换成结构断言 ============
   Task 6 评审的变异表实测：accent 两两互换、虚线 12px→1px、`.index` 轨道 8.5rem→2rem、
   删掉 `:focus-visible`、改 body 的 padding/14px、`.case-study --label` 改 100px、加一条外部字体
   `@import` —— 上面四条断言全部照样绿（它们只做全文 `includes`，深浅值能互相顶包、值能飘走）。
   下面的助手按 CSSOM 的形状断言：规则在不在「顶层」还是「哪个媒体块里」、选择器逐字、
   声明的键值成对；最后一条用例把这七种变异逐个喂给对应助手，确认每一次都真的变红。
   变异只在内存里对字符串做，css/style.css 全程不写。 */

// 注释里能藏 @import 与十六进制色值，解析前先剥掉（否则「零外部引用」这类断言会误报或被绕过）。
const cssPlain = css.replace(/\/\*[\s\S]*?\*\//g, '');
const POINTER_COND = '(hover: hover) and (pointer: fine)';
const DARK_COND = '(prefers-color-scheme: dark)';
const MOBILE_COND = '(max-width: 640px)';

// 从 openIdx 的 '{' 找到配对的 '}'（本文件无嵌套媒体，一层计数足够）
function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return i;
  }
  throw new Error('花括号不配对');
}

/* 全部 @media 块：{cond, body, start, bodyStart, end} */
function mediaBlocks(src) {
  const out = [];
  for (let i = src.indexOf('@media'); i >= 0; i = src.indexOf('@media', i + 1)) {
    const bodyStart = src.indexOf('{', i);
    const end = matchBrace(src, bodyStart);
    out.push({ cond: src.slice(i + 6, bodyStart).trim(), body: src.slice(bodyStart + 1, end), start: i, bodyStart, end });
    i = end;
  }
  return out;
}

/* 扁平规则：{sel, decls, bodyStart, bodyEnd}（下标相对于传入的字符串） */
function rulesIn(src, from = 0, to = src.length) {
  const out = [];
  for (let i = from; i < to;) {
    const bodyStart = src.indexOf('{', i);
    if (bodyStart < 0 || bodyStart >= to) break;
    const bodyEnd = src.indexOf('}', bodyStart);
    if (bodyEnd < 0 || bodyEnd > to) break;
    const decls = {};
    for (const d of src.slice(bodyStart + 1, bodyEnd).split(';')) {
      const k = d.indexOf(':');
      if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).trim();
    }
    const sel = src.slice(i, bodyStart).trim();
    if (sel) out.push({ sel, decls, bodyStart, bodyEnd });
    i = bodyEnd + 1;
  }
  return out;
}

// 顶层规则（跳过所有 @media 块）—— 基础版式只认这里，媒体块里的同名覆盖规则不算
function topLevelRules(src) {
  const out = [];
  let cursor = 0;
  for (const b of mediaBlocks(src)) {
    out.push(...rulesIn(src, cursor, b.start));
    cursor = b.end + 1;
  }
  out.push(...rulesIn(src, cursor, src.length));
  return out;
}

function rulesFor(src, cond) {
  if (cond === undefined) return topLevelRules(src);
  // 同一条件可能出现两个媒体块（本文件的 prefers-color-scheme: dark 就是 :root 与 .c-* 两块），
  // 按文档顺序合并，后写的顶掉先写的 —— 只取第一个块会读到 :root 那块而漏掉全部 accent。
  const out = [];
  for (const b of mediaBlocks(src)) if (b.cond === cond) out.push(...rulesIn(b.body));
  return out;
}

function declOf(src, sel, prop, cond) {
  const rules = rulesFor(src, cond).filter((r) => r.sel === sel);
  return rules.length ? rules[rules.length - 1].decls[prop] : undefined;
}

/* 变异夹具：改（val=null 则删）一条声明，其余字节不动。断言助手因此可以被就地证伪。 */
function withDecl(src, sel, prop, val, cond) {
  // cond 省略 = 只改顶层规则（topLevelRules 会跳过媒体块，否则 .pop() 会抓到深色块里的同名规则，
  // 「浅色值被深色值顶包」那条变异就会变成空操作）；给了 cond = 只改那个媒体块内部的规则。
  const candidates = cond === undefined
    ? [{ host: src, offset: 0, rules: topLevelRules(src) }]
    : mediaBlocks(src).filter((b) => b.cond === cond)
      .map((b) => ({ host: b.body, offset: b.bodyStart + 1, rules: rulesIn(b.body) }));
  let found = null;
  for (const t of candidates) {
    const rule = t.rules.filter((r) => r.sel === sel).pop();
    if (rule) { found = { ...t, rule }; break; }
  }
  assert.ok(found, `变异夹具找不到规则 ${sel}${cond ? `（${cond} 块内）` : ''}`);
  const { host, offset, rule } = found;
  const body = host.slice(rule.bodyStart + 1, rule.bodyEnd);
  const re = new RegExp(prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:[^;]*');
  const mutated = val === null ? body.replace(re, '') : body.replace(re, `${prop}: ${val}`);
  assert.notStrictEqual(mutated, body, `变异夹具未命中：${sel} 里没有 ${prop}`);
  const next = host.slice(0, rule.bodyStart + 1) + mutated + host.slice(rule.bodyEnd);
  return cond === undefined ? next : src.slice(0, offset) + next + src.slice(offset + host.length);
}

// slug ↔ hex 一对一：浅色取顶层 `.c-<slug>`，深色取 prefers-color-scheme: dark 块里的同名规则
function accentMap(src, cond) {
  const m = {};
  for (const r of rulesFor(src, cond)) {
    const one = (r.sel.match(/^\.c-([a-z0-9-]+)$/) || [])[1];
    if (one) m[one] = r.decls['--accent'];
  }
  return m;
}

function assertAccentPairing(src) {
  const light = {}, dark = {};
  for (const f of FEATURED) { light[f.slug] = f.accent.light; dark[f.slug] = f.accent.dark; }
  assert.deepStrictEqual(accentMap(src), light, '浅色块的 .c-<slug> ↔ accent.light 配对不符（两条互换、深浅顶包都在这红）');
  assert.deepStrictEqual(accentMap(src, DARK_COND), dark, '深色块的 .c-<slug> ↔ accent.dark 配对不符');
}

const DASH_GRADIENT = 'linear-gradient(to right, var(--rule) 50%, transparent 50%)';
function assertDashMechanism(src) {
  for (const [sel, size, cond] of [
    ['.row + .row', '12px 1px', undefined],
    ['hr.dashed', '12px 1px', undefined],
    ['.index li + li', '6px 1px', undefined],
  ]) {
    assert.strictEqual(declOf(src, sel, 'background-image', cond), DASH_GRADIENT, `${sel} 的虚线渐变被换掉了`);
    assert.strictEqual(declOf(src, sel, 'background-size', cond), size,
      `${sel} 的 background-size 不是 ${size}：渐变规则还在，虚线却会变成实线/密点 —— 只查「有没有 background-size」拦不住`);
  }
}

function assertIndexTracks(src) {
  assert.strictEqual(declOf(src, '.index a, .index .cell', 'grid-template-columns'), '2.25rem 8.5rem 1fr auto',
    '桌面四栏轨道不等于契约（2.25rem 8.5rem 1fr auto）');
  assert.strictEqual(declOf(src, '.index a, .index .cell', 'grid-template-columns', MOBILE_COND), '2.25rem auto 1fr',
    '≤640px 三栏轨道不等于契约（2.25rem auto 1fr，Task 6 裁定 C4 调换过次序）');
}

function assertFocusVisible(src) {
  assert.strictEqual(declOf(src, ':focus-visible', 'outline'), '2px solid currentColor', '缺 :focus-visible 的 2px currentColor 描边（键盘用户唯一的可见焦点）');
  assert.strictEqual(declOf(src, ':focus-visible', 'outline-offset'), '2px', ':focus-visible 的 outline-offset 不是 2px');
}

function assertBodyTypography(src) {
  const want = { 'max-width': '760px', padding: '4rem 2rem', 'font-size': '14px', 'font-weight': '450', 'line-height': '1.7' };
  for (const [prop, val] of Object.entries(want)) {
    assert.strictEqual(declOf(src, 'body', prop), val,
      `body 基础规则的 ${prop} 不是 ${val}（五项同块钉死：任一项飘走整页版式就变，而全文 includes 照样绿）`);
  }
}

function assertCaseLabelToken(src) {
  assert.strictEqual(declOf(src, '.case-study', '--label'), '150px', '.case-study 的 --label 不是 150px（详情页标签列宽）');
}

function assertNoExternalAssets(src) {
  assert.ok(!/@import/.test(src), 'CSS 含 @import：外部资源会走网络，file:// 直开时先白屏再跳');
  assert.ok(!/@font-face/.test(src), 'CSS 自定义字体：字栈是系统字体，引入外部字体等于加一次网络依赖');
  for (const u of src.match(/url\(\s*['"]?[^'")]+/g) || []) {
    assert.ok(/^url\(\s*['"]?data:/.test(u), `CSS 引用了外部 url（file:// 下会发请求）：${u}`);
  }
}

function assertHoverInsidePointerBlock(src) {
  assert.strictEqual(topLevelRules(src).filter((r) => r.sel.includes(':hover')).length, 0,
    '顶层出现 :hover 规则：触屏设备点上去会黏住悬停态，悬停样式必须整体关在指针媒体块里');
  const block = mediaBlocks(src).find((b) => b.cond === POINTER_COND);
  assert.ok(block, '(hover: hover) and (pointer: fine) 媒体块不见了');
  assert.ok(rulesIn(block.body).some((r) => r.sel === '.index a:hover'), '.index a:hover 没写在指针媒体块内');
}

test('accent 与 slug 一对一绑定：浅色块等于 accent.light，深色块等于 accent.dark', () => {
  assertAccentPairing(cssPlain);
});

test('虚线机制：两条 12px 1px 一条 6px 1px，渐变端点 50%', () => {
  assertDashMechanism(cssPlain);
});

test('.index 网格轨道等于契约（桌面四栏 / ≤640px 三栏）', () => {
  assertIndexTracks(cssPlain);
});

test(':focus-visible 是 2px currentColor 描边 + 2px offset', () => {
  assertFocusVisible(cssPlain);
});

test('body 的栏宽/内边距/字号/字重/行距同块钉死', () => {
  assertBodyTypography(cssPlain);
});

test('.case-study 的 --label 是 150px（顶层，不被媒体块顶包）', () => {
  assertCaseLabelToken(cssPlain);
});

test('零外部引用：无 @import、无 @font-face、url() 只允许 data:', () => {
  assertNoExternalAssets(cssPlain);
});

test('悬停规则只存在于可精确指针的媒体块内', () => {
  assertHoverInsidePointerBlock(cssPlain);
});

/* 巡游鲨鱼层的三条硬要求：不吃指针、正文压在它上面、该静止时彻底消失。
   少任何一条都是「看起来对、上线咬人」那类。 */
function assertSharkLayer(css) {
  const shark = (css.match(/\.shark \{([^}]*)\}/) || [])[1];
  assert.ok(shark, '缺 .shark 规则');
  for (const decl of ['position: fixed', 'inset: 0', 'z-index: 0', 'pointer-events: none']) {
    assert.ok(shark.includes(decl), `.shark 缺 ${decl}`);
  }
  const lift = (css.match(/\.masthead, main \{([^}]*)\}/) || [])[1];
  assert.ok(lift && lift.includes('z-index: 1'), '正文没抬到鲨鱼层之上，动效会糊在文字上');
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.shark \{[^}]*display: none/.test(css),
    'reduced-motion 下没隐藏鲨鱼');
  assert.ok(/@media print \{[\s\S]*\.shark \{ display: none; \}/.test(css), '打印时没隐藏鲨鱼');
}

test('巡游鲨鱼层：固定铺满、不吃指针、正文在上、reduced-motion 与打印隐藏', () => {
  assertSharkLayer(cssPlain);
});

/* 判别力对照：Task 6 评审的七种变异（M1/M4/M5/M6/M7/M9/M10）在旧断言下全绿。
   每条变异都只在内存字符串上做（css/style.css 不写），并额外确认「不改的原件仍然过」，
   以免助手是因为夹具坏了才红。 */
test('上述结构断言逐条可证伪（七种变异 + 原件对照）', () => {
  // 变异全部由 FEATURED 现推（写死 slug 与 hex 就等于又埋一条快照）
  const [fa, fb, fc] = FEATURED;
  const swapAccents = withDecl(withDecl(cssPlain, `.c-${fa.slug}`, '--accent', fb.accent.light),
    `.c-${fb.slug}`, '--accent', fa.accent.light);
  const darkStealsLight = withDecl(cssPlain, `.c-${fc.slug}`, '--accent', fc.accent.dark);
  const mutations = [
    ['M1 两条 accent 互换', swapAccents, assertAccentPairing],
    ['M8 浅色值被深色值顶包', darkStealsLight, assertAccentPairing],
    ['M4 行间虚线 12px 1px → 1px 1px', withDecl(cssPlain, '.row + .row', 'background-size', '1px 1px'), assertDashMechanism],
    ['M4b hr.dashed 的 12px → 6px', withDecl(cssPlain, 'hr.dashed', 'background-size', '6px 1px'), assertDashMechanism],
    ['M5 精选轨道 8.5rem → 2rem', withDecl(cssPlain, '.index a, .index .cell', 'grid-template-columns', '2.25rem 2rem 1fr auto'), assertIndexTracks],
    ['M5b 窄屏轨道改回四栏', withDecl(cssPlain, '.index a, .index .cell', 'grid-template-columns', '2.25rem auto 1fr auto', MOBILE_COND), assertIndexTracks],
    ['M6 删掉 :focus-visible 描边', withDecl(cssPlain, ':focus-visible', 'outline', null), assertFocusVisible],
    ['M6b focus offset 2px → 0px', withDecl(cssPlain, ':focus-visible', 'outline-offset', '0px'), assertFocusVisible],
    ['M7 body padding 改掉', withDecl(cssPlain, 'body', 'padding', '4rem 1rem'), assertBodyTypography],
    ['M7b body 字号 14px → 13px', withDecl(cssPlain, 'body', 'font-size', '13px'), assertBodyTypography],
    ['M9 .case-study --label 150px → 100px', withDecl(cssPlain, '.case-study', '--label', '100px'), assertCaseLabelToken],
    ['M10 追加外部字体 @import', '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@450");\n' + cssPlain, assertNoExternalAssets],
    ['M10b 追加外链 url()', cssPlain + '\n.avatar { background-image: url("https://cdn.example.com/a.png"); }', assertNoExternalAssets],
    ['悬停规则被挪出媒体块', `${cssPlain}\n.index a:hover { text-decoration: underline; }`, assertHoverInsidePointerBlock],
    /* 鲨鱼层四条：每条只削自己那块 —— reduced-motion 用「块首后停在第一个顶格 }」，print 用捕获组
       只删块内的 .shark 一行。若写成宽松的 [\s\S]*?\}，一条变异会顺带削掉另一条，说不清是谁拦的。 */
    ['鲨鱼层去掉 pointer-events', cssPlain.replace('pointer-events: none;', ''), assertSharkLayer],
    ['正文没抬层', cssPlain.replace('.masthead, main { position: relative; z-index: 1; }', ''), assertSharkLayer],
    ['reduced-motion 没隐藏鲨鱼', cssPlain.replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/, ''), assertSharkLayer],
    ['打印时没隐藏鲨鱼', cssPlain.replace(/(@media print \{[\s\S]*?)\.shark \{ display: none; \}/, '$1'), assertSharkLayer],
  ];
  for (const [name, mutated, helper] of mutations) {
    assert.notStrictEqual(mutated, cssPlain, `${name}：变异没有改动字符串，等于没做变异`);
    assert.throws(() => helper(mutated), { name: 'AssertionError' }, `${name} 没被对应的结构断言拦住`);
  }
  // 原件对照：变异夹具没把好端端的 CSS 改坏，也证明这些助手不是「怎么喂都红」
  for (const helper of [assertAccentPairing, assertDashMechanism, assertIndexTracks, assertFocusVisible,
    assertBodyTypography, assertCaseLabelToken, assertNoExternalAssets, assertHoverInsidePointerBlock, assertSharkLayer]) {
    assert.doesNotThrow(() => helper(cssPlain));
  }
});
