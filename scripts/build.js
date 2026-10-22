/* 构建入口：扫描仓库 → 策展 → 断言 → 写 index.html 与 case/*.html。
   用法：node scripts/build.js
   产物是生成物，请勿手改；要改内容改 content/*.js，要改版式改 scripts/template.js。 */
const fs = require('fs');
const path = require('path');
const { scanProjects } = require('./scan.js');
const { curate, classify, categoryName } = require('./curate.js');
const { homePage, casePage } = require('./template.js');
const { SITE } = require('../content/site.js');
const { FEATURED } = require('../content/featured.js');
const { contrast } = require('./util.js');

const OUT = path.resolve(__dirname, '..');
const { resolveScanRoot } = require('./scan-root.js');
const ROOT = resolveScanRoot();

/* scan.js 的 kind 是「项目形态的内部标识」（detectKind 的返回值），不是读者看得懂的技术名：
   `native-wx`/`static-site` 直接上屏就是扫描器术语泄漏。凡是要进「技术」区块的 kind 都先过这一层翻译；
   新增形态时在 KIND_LABEL 登记，而不是在计数或模板里加特例。未登记的 kind 原样返回（宁可少翻译一条，
   也不在标签层编造项目形态）。 */
const KIND_LABEL = {
  uniapp: 'uni-app',
  'native-wx': '原生微信小程序',
  'static-site': '静态官网',
  php: 'PHP 后台',
  'webpack-subpackage': 'webpack 分包应用',
};
const techLabel = (kind) => KIND_LABEL[String(kind)] || kind;

/* 首页「技术」块是个人内容（content/site.js 的 techStack，按前端招聘 JD 的常见技术栈写），
   不做扫描核对 —— 简历上的技术栈是自我描述，不是仓库统计。
   这里只钉形状：分组要有名字、条目要是非空字符串，避免漏了引号或写成对象时静默渲染成 [object Object]。 */
function assertTechStack(stack, push) {
  const groups = stack || [];
  if (!groups.length) { push('SITE.techStack 为空，首页技术块没有内容'); return; }
  for (const g of groups) {
    if (!g.name) push('技术栈缺分组名');
    if (!(g.items || []).length) push(`技术栈分组「${g.name}」是空的`);
    for (const item of g.items || []) {
      if (typeof item !== 'string' || !item.trim()) push(`技术栈条目不是非空字符串：${g.name} → ${JSON.stringify(item)}`);
    }
  }
}

/* 鲨鱼运动内核的源码要「测的一份 = 跑的一份」：整份读进来，只剥掉末尾那一行 CommonJS 导出，
   其余原样内联。两处形状不对就直接抛 —— 静默少一段代码比构建失败可怕得多。 */
const SHARK_FILE = path.join(__dirname, 'shark-motion.js');
function sharkMotionSource() {
  const text = fs.readFileSync(SHARK_FILE, 'utf8');
  if (/require\s*\(/.test(text)) throw new Error('shark-motion.js 引入了依赖，无法内联进浏览器');
  const at = text.lastIndexOf('module.exports');
  if (at < 0 || text.indexOf('module.exports') !== at) {
    throw new Error('shark-motion.js 必须只在文件末尾有一处 module.exports');
  }
  return text.slice(0, at).trim();
}

function buildContext(rootDir = ROOT) {
  const records = scanProjects(rootDir);
  const excludeDirs = FEATURED.map((f) => f.dir);
  const { stats } = curate(records, { excludeDirs });
  const byDir = new Map(records.map((r) => [r.dir, r]));

  const featured = FEATURED.map((f) => {
    const r = byDir.get(f.dir);
    if (!r) throw new Error(`精选项目未在仓库中扫到：${f.dir}`);
    return {
      monogram: f.monogram, name: f.name, oneLine: f.oneLine, slug: f.slug,
      meta: `${r.pages} 页 · ${categoryName(classify(r))}`, href: `case/${f.slug}.html`,
    };
  });

  /* mergedRecords（合并后的 81 条）现在只服务 stats.projects 这一个数：
     首页 <meta description> 那句「N 个小程序与 H5 项目」必须与详情页 meta 的口径一致，
     用未合并的 90 个目录会把项目数报大（final review I-1 同源的问题）。 */
  return { site: SITE, records, byDir, featured, featuredReal: FEATURED, stats, sharkMotion: sharkMotionSource() };
}

/* 门槛聚合：util.js 的 contrast() 对畸形色值抛错（fail-closed 设计），
   所以每条断言都要接住异常并记进清单 —— 一处坏数据不该以原始堆栈中止构建，
   也不该只报第一条。清单非空时在末尾照常 throw：进程非零退出，且调用方在写盘之前，产物不落。 */
function assertContext(ctx) {
  const errors = [];
  const push = (msg) => errors.push(msg);
  const contrastAtLeast = (hex, bg, label, dir) => {
    try {
      const ratio = contrast(hex, bg);
      if (ratio < 4.5) push(`${dir} ${label} 对比度 ${ratio.toFixed(2)} 不足 4.5（对 ${bg}）`);
    } catch (e) { push(`${dir} ${label} 无法校验：${e.message}`); }
  };

  /* 断言层自己不崩：入参形状不对时也要报进清单，而不是抛 TypeError 换一种方式中止。
     （buildContext 才是 fail-loud 的那一层：它拿不到记录就直接 throw。） */
  const featured = ctx.featured || [];
  const stats = ctx.stats || {};
  const byDir = ctx.byDir || new Map();
  if (featured.length !== 10) push(`精选应恰好 10 条，实际 ${featured.length}`);
  for (const f of FEATURED) {
    if (!byDir.has(f.dir)) push(`${f.dir} 未扫到`);
    if (!f.name) push(`${f.dir} 缺展示名`);
    else if (f.monogram !== f.name[0]) push(`${f.dir} monogram 与展示名首字不符`);
    /* slug 是唯一没经 esc() 就进 HTML 的字段（<body class="case-study c-<slug>"> 与 .c-<slug> 选择器），
       所以在此钉死形状：小写字母数字用连字符连接。css/style.css 里的 10 条 accent 规则也是这个形状。 */
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(f.slug))) push(`${f.dir} slug 形状非法（只能小写字母数字与连字符）：${f.slug}`);
    if (!f.accent) { push(`${f.dir} 缺 accent`); continue; }
    contrastAtLeast(f.accent.light, '#ffffff', '浅色 accent', f.dir);
    contrastAtLeast(f.accent.dark, '#0e0e0e', '深色 accent', f.dir);
  }
  if (new Set(FEATURED.map((f) => f.slug)).size !== FEATURED.length) push('slug 重复');
  assertTechStack(ctx.site && ctx.site.techStack, push);
  /* <meta description> 直接插值 stats.projects：它一旦被 curate 改名或算丢，页面会安静地写出
     「undefined 个小程序与 H5 项目」。 */
  if (typeof stats.projects !== 'number') push('stats.projects 缺失，页面描述里的项目总数会渲染成 undefined');
  /* 本地产物引用一旦写错，页面会静默丢图（浏览器只留一个碎图标），所以构建期就判文件在不在。
     favicon 的路径由 template.layout() 固定，avatar 的路径来自 SITE.avatar。 */
  for (const asset of [ctx.site && ctx.site.avatar, 'img/favicon.png'].filter(Boolean)) {
    if (!fs.existsSync(path.join(OUT, asset))) push(`本地产物引用不存在：${asset}`);
  }
  if (errors.length) throw new Error('断言失败:\n  ' + errors.join('\n  '));
}

function reportPlaceholders(site) {
  console.log(`提示：${site.占位.length} 个个人字段为占位假数据，上线前替换 content/site.js：${site.占位.join(', ')}`);
}

/* 详情页的事实列全部来自扫描记录：模板不写任何页数/分包数/日期，也不写仓库里查不到的说法。
   pageTitles 过滤掉泛称（首页/我的/登录…）——它们是导航噪声不是模块名；过滤后为空则回落到原始标题，
   因为「一个标题都没渲染」比「标题偏泛」更糟，而 casePage 的 length 守卫仍会挡住完全无标题的项目。
   signals 为空时回落到项目形态，同样要过 techLabel —— 否则 `native-wx` 这类内部标识会直接进详情页「技术」列。
   概览句的项目名以策展名（feat.name，即页头 cs-company 用的那一个）开头：同一页只能有一个名字真相源，
   manifest 原名与目录名都是实数据，降级成括注保留（manifest 名可能与策展名不同，目录名告诉读者去哪儿找代码）。
   括注只保留「与已显示的那个名字不同」的事实（final review M-1）：三个名字全等时那句
   「拼豆小程序（manifest 名 拼豆小程序，目录名 拼豆小程序）」把同一个串打印三遍，10 页里有 6 页如此；
   而 蓝牙设备 / 灵猫健康服务、港澳租车 / 港澳租车原新改 这类差异才是读者要的信息，必须留下。 */
function factsFor(record, feat = {}) {
  const titles = record.pageTitles.filter((t) => t && !/^(首页|我的|登录|注册|详情|列表|搜索|设置|消息)$/.test(t));
  const name = feat.name || record.displayName;
  const extra = [['manifest 名', record.displayName], ['目录名', record.dir]].filter(([, value]) => value !== name);
  const parenthetical = extra.length ? `（${extra.map(([label, value]) => `${label} ${value}`).join('，')}）` : '';
  return {
    pages: record.pages,
    subPackages: record.subPackages,
    category: classify(record),
    lastCommit: record.lastCommit || '—',
    signals: record.signals.length ? record.signals : [techLabel(record.kind)],
    pageTitles: titles.length ? titles : record.pageTitles,
    summary: `${name}${parenthetical}：${record.pages} 个页面`
      + `${record.subPackages ? `、${record.subPackages} 个分包` : ''}`
      + `${record.commits ? `、仓库内 ${record.commits} 次提交，最近 ${record.lastCommit}` : ''}。`,
  };
}

function writeCases(ctx, outDir = path.join(OUT, 'case')) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (let i = 0; i < FEATURED.length; i++) {
    const feat = FEATURED[i];
    const record = ctx.byDir.get(feat.dir);
    if (!record) throw new Error(`精选项目未在仓库中扫到：${feat.dir}`);
    const html = casePage({ feat, facts: factsFor(record, feat) });
    const name = `${feat.slug}.html`;
    fs.writeFileSync(path.join(outDir, name), html, 'utf8');
    files.push(name);
  }
  return files;
}

if (require.main === module) {
  const ctx = buildContext();
  assertContext(ctx);
  reportPlaceholders(ctx.site);
  fs.writeFileSync(path.join(OUT, 'index.html'), homePage(ctx), 'utf8');
  console.log(`index.html 已生成：精选 ${ctx.featured.length} · 技术栈 ${(ctx.site.techStack || []).reduce((s, g) => s + (g.items || []).length, 0)} 条分 ${(ctx.site.techStack || []).length} 组 · 全站 ${ctx.stats.projects} 个项目 ${ctx.stats.pages} 页 · 巡游鲨鱼脚本 ${ctx.sharkMotion.length} 字节`);
  const cases = writeCases(ctx);
  console.log(`详情页已生成：${cases.length} 个 → ${path.join(OUT, 'case')}`);
}

module.exports = { buildContext, assertContext, writeCases, factsFor, techLabel, KIND_LABEL, sharkMotionSource };
