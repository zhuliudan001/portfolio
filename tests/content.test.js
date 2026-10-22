const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { scanProjects } = require('../scripts/scan.js');
const { FEATURED } = require('../content/featured.js');
const { SITE } = require('../content/site.js');
const { contrast } = require('../scripts/util.js');

const { resolveScanRoot } = require('../scripts/scan-root.js');
const ROOT = resolveScanRoot();

test('精选恰好 10 条，slug 唯一且 dir 命中扫描结果', () => {
  assert.strictEqual(FEATURED.length, 10);
  assert.strictEqual(new Set(FEATURED.map((f) => f.slug)).size, 10);
  const dirs = new Set(scanProjects(ROOT, { git: false }).map((r) => r.dir));
  for (const f of FEATURED) assert.ok(dirs.has(f.dir), `${f.dir} 在仓库中不存在`);
});

test('每条都有 monogram（取展示名首字）、一句话、3–5 个带依据的要点', () => {
  for (const f of FEATURED) {
    assert.strictEqual(f.monogram, f.name[0], f.dir);
    assert.ok(f.oneLine.length >= 8 && f.oneLine.length <= 24, `${f.dir} 一句话长度越界`);
    assert.ok(f.points.length >= 3 && f.points.length <= 5, `${f.dir} 要点数越界`);
    for (const p of f.points) {
      assert.ok(p.text.length > 6 && p.依据.length > 3, `${f.dir} 存在无代码依据的要点：${p.text}`);
      assert.ok(/^[^/\\]+[\\/]/.test(p.依据), `${f.dir} 依据需以「项目目录/」开头：${p.依据}`);
    }
  }
});

test('accent 双向对比度达标', () => {
  for (const f of FEATURED) {
    assert.ok(contrast(f.accent.light, '#ffffff') >= 4.5, `${f.dir} 浅色 accent 白字对比度不足`);
    assert.ok(contrast(f.accent.dark, '#0e0e0e') >= 4.5, `${f.dir} 深色 accent 文字对比度不足`);
    assert.ok(/^#[0-9a-f]{6}$/.test(f.accent.light) && /^#[0-9a-f]{6}$/.test(f.accent.dark), f.dir);
  }
});

test('个人信息字段集中在 site.js 且都带占位标记', () => {
  const fields = ['name', 'email', 'phone', 'wechat', 'github'];
  for (const k of fields) assert.ok(typeof SITE.contact[k] === 'string' && SITE.contact[k].length, `缺字段 ${k}`);
  assert.ok(SITE.占位.length >= fields.length, '占位标记数量不足');
});

const fs = require('node:fs');

test('每条要点依据指向的仓库路径真实存在', () => {
  for (const f of FEATURED) {
    for (const p of f.points) {
      assert.ok(fs.existsSync(path.join(ROOT, p.依据)), `${f.dir} 的依据不存在：${p.依据}`);
    }
  }
});

test('依据不得落在 vendored 目录', () => {
  for (const f of FEATURED) {
    for (const p of f.points) {
      assert.ok(!/uni_modules|node_modules|unpackage|\.mimocode/.test(p.依据),
        `${f.dir} 的依据落在 vendored 目录，那不是作者写的：${p.依据}`);
    }
  }
});

test('依据必须是文件而非目录', () => {
  for (const f of FEATURED) {
    for (const p of f.points) {
      const abs = path.join(ROOT, p.依据);
      assert.ok(fs.existsSync(abs) && fs.statSync(abs).isFile(),
        `${f.dir} 的依据必须指向具体文件，目录指针挡不住内容漂移：${p.依据}`);
    }
  }
});

test('文案不得手写页数或分包数 —— 计数一律由扫描派生', () => {
  // 汉字数词同样要拦：I3 那条「分四组分包」正是中文写法，只查 \d 会放过它
  const counted = /(?:[0-9]|[一二两三四五六七八九十百])[^，。；]{0,4}(?:页|分包)/;
  for (const f of FEATURED) {
    assert.ok(!counted.test(f.oneLine), `${f.dir} 的一句话里手写了计数：${f.oneLine}`);
    for (const p of f.points) assert.ok(!counted.test(p.text), `${f.dir} 的要点手写了计数：${p.text}`);
  }
});

test('组件型依据必须真的被页面接线', () => {
  // 组件存在但全站零引用 = 死代码，不能支撑「本项目做了 X」
  const cp = require('node:child_process');
  for (const f of FEATURED) {
    for (const p of f.points) {
      const m = p.依据.match(/^([^/]+)\/components\/([^/]+)\/(.+\.vue)$/);
      if (!m) continue;
      const [_, proj, tag] = m;
      let hit = '';
      try {
        hit = cp.execFileSync('git', ['grep', '-l', `<${tag}`, '--', proj,
          `:!${proj}/unpackage`, `:!${proj}/node_modules`, `:!${proj}/uni_modules`],
          { cwd: ROOT, encoding: 'utf8' }).trim();   // 排除构建产物：.wxml/.js.map 里的标签不算第一方接线
      } catch (e) {
        // git grep 用退出码 1 表达「零命中」，那不是环境故障；交给下面的断言报出是哪个组件没接线
        if (e.status !== 1) throw e;
      }
      assert.ok(hit.length > 0, `${f.dir} 的组件依据未被任何页面引用（死代码）：${p.依据}`);
    }
  }
});

test('utils/store 里的代码型依据必须被别处引用（防第一方死代码）', () => {
  // 组件依据由「接线」测试覆盖；页面依据由 pages.json 注册覆盖。
  // 但 C1 那条原型 —— 一个没人 import 的 utils/*.js —— 两者都拦不住，只能按引用路径查。
  const cp = require('node:child_process');
  for (const f of FEATURED) {
    for (const p of f.points) {
      const m = p.依据.match(/^([^/]+)\/(utils|store)\/(.+\.js)$/);
      if (!m) continue;
      const [, proj] = m;
      const tail = p.依据.replace(new RegExp(`^${proj}/`), '').replace(/\.js$/, ''); // 形如 utils/bluetooth
      let out = '';
      try {
        out = cp.execFileSync('git', ['grep', '-l', '-F', tail, '--',
          proj, `:!${proj}/unpackage`, `:!${proj}/node_modules`, `:!${proj}/uni_modules`],
          { cwd: ROOT, encoding: 'utf8' });   // 同样只认源码里的引用，构建产物里的路径字符串不算
      } catch (e) {
        if (e.status !== 1) throw e;   // 零命中交给断言
      }
      const hits = out.trim().split('\n').filter(Boolean).filter((f2) => f2 !== p.依据);
      assert.ok(hits.length >= 1, `${f.dir} 的依据没人引用，是死代码不是交付：${p.依据}`);
    }
  }
});

/* final review I-2：规格 §9 说「近期」取自真实 lastCommit，而过去那句是把两个日期手抄进 SITE.now 的散文里
   （注释还写着「重跑 scan.js 后需同步」），且没有任何断言约束 —— 拼豆本周就被改过两次，抄下来的日期必然过期。
   日期本来已由数据上屏（详情页 .cs-meta 的 lastCommit、首页归档行的年份跨度），散文里不需要再写一遍。
   守卫写成可复用的纯函数，好让下面的「注入日期」对照走同一条代码路径。 */
const DATE_LITERAL = /\d{4}-\d{2}-\d{2}/;
function proseStrings(node, label = 'SITE', out = []) {
  if (typeof node === 'string') out.push([label, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => proseStrings(v, `${label}[${i}]`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) proseStrings(v, `${label}.${k}`, out);
  return out;
}
function assertNoHandWrittenDates(site) {
  const hits = proseStrings(site).filter(([, v]) => DATE_LITERAL.test(v));
  assert.strictEqual(hits.length, 0,
    'SITE 散文手写了日期，重跑 scan.js 后就会与详情页 meta 的 lastCommit 打对台：'
    + hits.map(([k, v]) => `${k}「${v.match(DATE_LITERAL)[0]}」`).join('、'));
}

test('SITE 散文不得出现硬编码日期（YYYY-MM-DD 一律由扫描数据渲染）', () => {
  const strings = proseStrings(SITE);
  const keys = strings.map(([k]) => k);
  assert.ok(strings.length >= 20, `夹具异常：SITE 只抓到 ${strings.length} 条字符串，遍历没覆盖到散文`);
  for (const required of ['SITE.about', 'SITE.now', 'SITE.tagline']) {
    assert.ok(keys.includes(required), `夹具异常：SITE.${required.split('.')[1]} 没进入遍历，日期守卫覆盖不到它`);
  }
  assertNoHandWrittenDates(SITE);

  /* 判别力对照（content/site.js 不动，只改内存副本）：
     ① 往 now 里抄回原来的日期；② 往经历时间里塞日期；③ 往 about 里塞 —— 三条都必须变红，
        且报错要指出是哪个字段，否则「禁日期」这条随时能被「换个字段写」绕过。 */
  const cases = [
    ['SITE.now', `${SITE.now}（最近提交 2026-10-12）`],
    ['SITE.experience[0].meta', '前端开发工程师 · 2022-06-01 — 至今'],
    ['SITE.about', `${SITE.about} 最近更新于 2024-01-01。`],
  ];
  for (const [where, value] of cases) {
    const doctored = where === 'SITE.now' ? { ...SITE, now: value }
      : where === 'SITE.about' ? { ...SITE, about: value }
        : { ...SITE, experience: SITE.experience.map((e, i) => (i === 0 ? { ...e, meta: value } : e)) };
    // 字段路径含 `.` 与 `[0]`，直接进 RegExp 会被当量词/字符类，必须整体转义
    const whereRe = new RegExp(where.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    assert.throws(() => assertNoHandWrittenDates(doctored), whereRe,
      `对照失效：往 ${where} 注入 2026-10-12 这样的日期，守卫没报出这个字段`);
  }
});

test('品牌标记必须是真实 PNG，尺寸与首页头像 / 标签页图标用途一致', () => {
  /* 换成位图后，「浅色态必须写成呈现属性」那条 SVG 规则随之作废 —— 位图把颜色烤死在像素里，
     不执行 CSS 的渲染器也不会变一团黑。剩下的风险是导出错尺寸或把文本存成 .png，按 IHDR 核对。 */
  const sizes = { 'img/avatar.png': 256, 'img/favicon.png': 32 };
  for (const [rel, size] of Object.entries(sizes)) {
    const buf = fs.readFileSync(path.join(__dirname, '..', rel));
    assert.deepStrictEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${rel} 不是 PNG`);
    assert.strictEqual(buf.readUInt32BE(16), size, `${rel} 宽度应为 ${size}`);
    assert.strictEqual(buf.readUInt32BE(20), size, `${rel} 高度应为 ${size}`);
  }
});
