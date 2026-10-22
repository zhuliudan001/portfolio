const test = require('node:test');
const assert = require('node:assert');
const { indexItem, row, plainItem, homePage } = require('../scripts/template.js');

// 自包含夹具：homePage 只从 ctx 取值，测试不依赖 buildContext、不依赖真实仓库状态
const baseCtx = () => ({
  site: {
    name: '张三', tagline: 'uni-app 跨端开发工程师', avatar: '',
    about: '自述正文', now: '近期在推进某项目',
    experience: [{ monogram: '某', name: '某公司', note: '负责小程序交付', meta: '前端开发工程师 · 2022.06 — 至今' }],
    contact: { email: 'a@b.com', wechat: 'wxid_1', github: 'github.com/x', phone: '138****1234' },
    techStack: [
      { name: '框架与跨端', items: ['uni-app 一套代码多端交付'] },
      { name: '工程化', items: ['Git 分支协作'] },
    ],
  },
  featured: [{ monogram: '飞', name: '飞鹰传媒', oneLine: '沙龙活动平台', meta: '111 页 · 内容', href: 'case/feiying-media.html', slug: 'feiying-media' }],
  stats: { dirs: 45, projects: 42, listed: 38, pages: 900, span: '2024–2026' },
});
const patchSite = (ctx, over) => Object.assign(ctx, { site: Object.assign({}, ctx.site, over) });

test('indexItem 生成 4 栏结构与 accent 类', () => {
  const html = indexItem({ monogram: '飞', name: '飞鹰传媒', oneLine: '沙龙活动平台', meta: '111 页 · 内容', href: 'case/feiying-media.html', slug: 'feiying-media' });
  assert.match(html, /<li><a href="case\/feiying-media\.html" class="c-feiying-media">/);
  assert.ok(html.includes('<span class="num">[飞]</span>'));
  assert.ok(html.includes('<span class="client">飞鹰传媒</span>'));
  assert.ok(html.includes('<span class="role">111 页 · 内容</span>'));
});

test('indexItem 无 href 时降级为 .cell 且不输出锚点', () => {
  const html = indexItem({ monogram: 'X', name: '项目名', oneLine: '一句话描述', meta: '10 页', href: '', slug: '' });
  assert.ok(!html.includes('<a'), '降级行不应有锚点');
  assert.ok(html.includes('class="cell"'), '降级行应使用 .cell');
});

test('row 生成标签列 + 内容列', () => {
  assert.strictEqual(row('关于', '<p>正文</p>'), '<section class="row"><h2>关于</h2><div><p>正文</p></div></section>');
});

test('homePage 输出六个区块，且不再渲染「全部项目」', () => {
  const html = homePage(baseCtx());
  for (const label of ['关于', '近期', '精选项目', '经历', '技术', '联系']) {
    assert.ok(html.includes(`<h2>${label}</h2>`), `缺区块 ${label}`);
  }
  assert.ok(!html.includes('<h2>全部项目</h2>'), '归档模块已按用户要求移除，不该再出现在首页');
  assert.ok(html.includes('class="masthead"'), '缺 masthead');
  assert.ok(html.includes('<p class="group">框架与跨端</p>'), '技术块缺分组标题');
  assert.ok(html.includes('uni-app 一套代码多端交付'), '技术栈条目未渲染');
  assert.ok(!/来自 \d+ 个项目/.test(html), '技术块不该再出现扫描计数（已改成人写的技术栈）');
  /* 归档行没了，但 stats.projects 仍被 <meta description> 用着 —— 这条钉住它没被顺手删成 undefined。 */
  assert.ok(html.includes('42 个小程序与 H5 项目'), '页面描述里的项目总数没渲染');
});

/* 契约已从「产物零 JavaScript」改为「零运行时依赖 + 首页一段内联动效脚本」。
   详情页仍然零 JS —— 那条锁在 build.test.js 里，别在这里放松。 */
test('首页只允许一段内联鲨鱼脚本，没传源码时一段都不该有', () => {
  const html = homePage(Object.assign(baseCtx(), { sharkMotion: 'var shark = 1;' }));
  const scripts = html.match(/<script/g) || [];
  assert.strictEqual(scripts.length, 1, `首页出现 ${scripts.length} 段脚本，应当只有一段`);
  assert.ok(html.includes('<canvas class="shark" aria-hidden="true"'), '缺鲨鱼画布或缺 aria-hidden');
  assert.ok(html.includes('prefers-reduced-motion'), '胶水层没做 reduced-motion 前置判断');
  assert.ok(html.includes('visibilitychange'), '胶水层没在页面隐藏时暂停');
  assert.ok(/devicePixelRatio[^;]*,\s*2/.test(html), 'DPR 采样没有 2 倍上限');
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  /* 'use strict'; 必须是 IIFE 的第一条语句。它一旦落到插值进来的运动源码之后，
     就不在指令序列里了 —— 整段脚本会以 sloppy 模式运行，而产物字节只差一个位置，
     光看「有没有这段字符串」是拦不住的（Task 4 评审裁定过，本轮复核实测「挪回去」仍全绿）。 */
  assert.ok(inline.startsWith("\n(function () {\n'use strict';"),
    "'use strict' 不是 IIFE 的第一条语句（整段会退化成 sloppy 模式）");
  /* 种子按天稳定：同一天刷新起点一致。裸 Date.now() 会让每刷一次就换一个地方。 */
  assert.ok(/mulberry32\(Math\.floor\(Date\.now\(\) \/ 864e5\)/.test(inline),
    '随机种子不是「按天稳定」，刷新页面会随机换鲨鱼的起点与朝向');
  assert.ok(!/\ssrc\s*=/.test(inline), '内联脚本里出现 src=，会变成外部请求');
  assert.ok(!/eval|document\.write|fetch\(|XMLHttpRequest/.test(inline), '内联脚本含危险调用');
  assert.ok(!homePage(baseCtx()).includes('<script'), '没传 sharkMotion 时首页不该凭空出现脚本');
});

test('homePage 转义特殊字符', () => {
  const html = homePage(patchSite(baseCtx(), { name: 'A&B<x>' }));
  assert.ok(html.includes('A&amp;B&lt;x&gt;'));
  assert.ok(!html.includes('<h1>A&B'));
});

test('contact 为空对象时联系区块整块不渲染', () => {
  const html = homePage(patchSite(baseCtx(), { contact: {} }));
  assert.ok(!html.includes('<h2>联系</h2>'), '空联系字段不应留空行');
  assert.ok(!html.includes('mailto:'));
});

test('about 为空时关于区块不渲染，不留空标签列', () => {
  const html = homePage(patchSite(baseCtx(), { about: '' }));
  assert.ok(!html.includes('<h2>关于</h2>'));
});

test('技术块里空分组被跳过，整块为空时不留标签列', () => {
  const withStack = (stack) => homePage(patchSite(baseCtx(), { techStack: stack }));
  assert.ok(!withStack([{ name: '工具', items: [] }]).includes('<h2>技术</h2>'), '分组全空时不应渲染技术行');
  const oneEmpty = withStack([{ name: '空组', items: [] }, { name: '框架与跨端', items: ['uni-app 一套代码多端交付'] }]);
  assert.ok(!oneEmpty.includes('<p class="group">空组</p>'), '空分组不该留下光杆标题');
  assert.ok(oneEmpty.includes('<p class="group">框架与跨端</p>'), '非空分组被误删了');
});

test('site.avatar 有值时 masthead 渲染品牌标记，为空时不留空图位', () => {
  const withAvatar = homePage(patchSite(baseCtx(), { avatar: 'img/avatar.png' }));
  assert.match(withAvatar, /<img class="avatar" src="img\/avatar\.png" alt="张三" width="48" height="48">/);
  assert.ok(!homePage(baseCtx()).includes('class="avatar"'), 'avatar 为空时不应输出空 img');
});

test('plainItem 左文右注', () => {
  assert.strictEqual(plainItem('uni-app', '来自 40 个项目'),
    '<li><span>uni-app</span><span class="muted">来自 40 个项目</span></li>');
});
