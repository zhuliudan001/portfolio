/* 只读扫描上级仓库兄弟项目 → data/projects.json
   用法：node scripts/scan.js
   扫描根由 scripts/scan-root.js 解析（搬出大仓后不再等于"往上两层"）；本脚本只读它，任何写操作只落在 portfolio/ 内。 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { resolveScanRoot } = require('./scan-root.js');

/* 扫描根由 scan-root.js 统一解析（env > scan-root.local.json > ../..）。
   本脚本只读该目录，任何写操作只落在 portfolio/ 内。 */
const ROOT_DIR = resolveScanRoot();
const OUTPUT_FILE = path.resolve(__dirname, '../data/projects.json');
const EXCLUDE_DIRS = new Set(['.git', '.mimocode', '.trae', '.vscode', '.idea', '.kilo', 'node_modules', 'portfolio']);
const VENDOR_DIRS = new Set(['node_modules', 'unpackage', '.mimocode', 'uni_modules', 'static', 'vendor']);

/* 去 JS 风格注释与尾逗号，且绝不破坏字符串字面量。
   旧实现 `content.replace(/\/\/.*$/gm, '')` 会把 "target": "https://api.example.com/" 里
   的 `//` 到行尾整段删掉，留下未闭合字符串 —— 实测 gushici/manifest.json 因此解析失败。 */
function stripComments(content) {
  let out = '';
  const inString = []; // 与 out 等长的掩码，标记该字符是否位于字符串字面量内
  let str = false;
  let i = 0;
  const push = (ch) => { out += ch; inString.push(str); };
  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];
    if (str) {
      if (ch === '\\') { push(ch); if (next !== undefined) push(next); i += 2; continue; }
      if (ch === '"') { str = false; push(ch); i += 1; continue; }
      push(ch); i += 1; continue;
    }
    if (ch === '"') { str = true; push(ch); i += 1; continue; }
    if (ch === '/' && next === '/') { while (i < content.length && content[i] !== '\n') i += 1; continue; }
    if (ch === '/' && next === '*') {
      const end = content.indexOf('*/', i + 2);
      i = end === -1 ? content.length : end + 2;
      continue;
    }
    push(ch); i += 1;
  }
  return { out, inString };
}

function parseJsonWithComments(content) {
  const { out, inString } = stripComments(content.replace(/^\uFEFF/, '')); // 容忍 UTF-8 BOM
  let cleaned = '';
  for (let k = 0; k < out.length; k++) {
    if (out[k] !== ',' || inString[k]) { cleaned += out[k]; continue; }
    let j = k + 1;
    while (j < out.length && /\s/.test(out[j])) j += 1;
    if (out[j] === ']' || out[j] === '}') continue; // 丢弃字符串外的尾逗号
    cleaned += out[k];
  }
  return JSON.parse(cleaned);
}

/* errors 由调用方传入：把「文件存在但解析失败」与「文件不存在」区分开（规格 §10 异常态） */
function readJson(dir, file, errors) {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return null;
  try {
    return parseJsonWithComments(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    if (errors) errors.push(`${p}: ${e.message}`);
    return null;
  }
}

function has(dir, file) { return fs.existsSync(path.join(dir, file)); }

function detectKind(flags) {
  if (flags.manifest) return 'uniapp';
  if (flags.app && flags.appWxss) return 'native-wx';
  if (flags.srcApp && flags.projectConfig) return 'webpack-subpackage';
  if (flags.composer) return 'php';
  if (flags.indexHtml) return 'static-site';
  return 'unknown';
}

const SIGNALS = {
  支付: ['requestPayment'],
  地图: ['<map', 'requestLocation', 'chooseLocation'],
  canvas: ['<canvas', 'createCanvasContext'],
  录音: ['getRecorderManager', 'RecorderManager'],
  直播: ['live-player', 'live-pusher'],
  视频: ['<video'],
  IM: ['connectSocket', 'SocketTask'],
  SSE: ['text/event-stream', 'EventSource'],
  扫码: ['scanCode'],
  蓝牙: ['openBluetoothAdapter', 'BLECharacteristic'],
  分包: ['subPackages'],
  Vuex: ['vuex'],
  i18n: ['zh-Hans', 'locale/'],
};
const TEXT_EXT = /\.(vue|js|json|wxss|css|scss|wxs)$/;
const MINIFIED = /\.min\.(js|css)$/;   // 压缩库常不在标准目录名下，按文件名再拦一道
const LIB_DIRS = new Set(['libs', 'dist', 'build', 'addons']); // 只拦真实 vendored 目录名；不拦 public/assets —— 它们也装第一方源码（实测 huadengshang/public/js/main.js 有真 <video>）
const MAX_FILE = 400 * 1024;
const MAX_DEPTH = 10;                   // 原为 5：实测 xcx-master 的第一方组件位于第 7 层，5 层会静默丢信号

function sourceFiles(dir, depth = 0, out = []) {
  if (depth > MAX_DEPTH || out.length > 4000) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    if (VENDOR_DIRS.has(e.name) || LIB_DIRS.has(e.name.toLowerCase()) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, depth + 1, out);
    else if (TEXT_EXT.test(e.name) && !MINIFIED.test(e.name)) {
      try { if (fs.statSync(p).size <= MAX_FILE) out.push(p); } catch (err) { /* 跳过不可读文件 */ }
    }
  }
  return out;
}

function collectSignals(dir) {
  const entries = Object.entries(SIGNALS);
  const found = new Set();
  for (const f of sourceFiles(dir)) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; /* 跳过读取失败 */ }
    for (const [name, keys] of entries) { // 只对尚未命中的信号测本文件，不再拼整站大字符串
      if (found.has(name)) continue;
      if (keys.some((k) => text.includes(k))) found.add(name);
    }
    if (found.size === entries.length) break; // 全部命中即提前收
  }
  return entries.map(([name]) => name).filter((n) => found.has(n)); // 保持 SIGNALS 键序
}

/* 少数项目实际嵌套一层同名目录（AGENTS.md 记载 xcx-master 位于 xcx-master/xcx-master/）。
   本层没有可识别配置、而下层有时，以下层为准 —— 否则该形态会被判 unknown 而整条丢失。 */
const CONFIG_FILES = ['manifest.json', 'pages.json', 'app.json', 'project.config.json', 'composer.json', 'index.html'];

function hasConfig(d) {
  return CONFIG_FILES.some((f) => has(d, f)) || has(path.join(d, 'src'), 'app.json');
}

function projectDirOf(dir) {
  if (hasConfig(dir)) return dir;
  const nested = path.join(dir, path.basename(dir));
  try {
    if (fs.statSync(nested).isDirectory() && hasConfig(nested)) return nested;
  } catch (e) { /* 无同名下层目录 */ }
  return dir;
}

function flagsOf(dir) {
  return {
    manifest: has(dir, 'manifest.json'), app: has(dir, 'app.json'), appWxss: has(dir, 'app.wxss'),
    srcApp: has(path.join(dir, 'src'), 'app.json'), projectConfig: has(dir, 'project.config.json'),
    composer: has(dir, 'composer.json'), indexHtml: has(dir, 'index.html'),
  };
}

/* 依次找三种形态的配置文件。区分三件事：文件不存在（继续找下一种）、
   文件存在但解析失败（返回空配置，绝不回落到别的文件——否则会报出另一个项目的页数）。 */
function configOf(dir, errors) {
  const candidates = [[dir, 'pages.json'], [path.join(dir, 'src'), 'app.json'], [dir, 'app.json']];
  for (const [base, file] of candidates) {
    if (!fs.existsSync(path.join(base, file))) continue;
    return readJson(base, file, errors) || {};
  }
  return null;
}

function countAndTitles(config) {
  if (!config) return { pages: 0, subPackages: 0, pageTitles: [] };
  const subs = config.subPackages || config.subpackages || [];
  const all = (config.pages || []).concat(...subs.map((s) => s.pages || []));
  const titles = all.map((p) => (p.style && p.style.navigationBarTitleText) || '').filter(Boolean);
  return { pages: all.length, subPackages: subs.length, pageTitles: [...new Set(titles)] };
}

/* 一次 git log 读全仓库提交，按顶层目录归属，取代旧版每目录一次 execFileSync（90 次 → 1 次）。
   - `-c core.quotePath=false` 关掉非 ASCII 路径的八进制转义：不加它，中文目录名会打成 `"\346..."`，
     按 `/` 切出的首段拿不到真实目录名，所有提交数都会对不上。
   - `--no-renames` 关掉重命名检测：重命名会把 old -> new 印在同一行，首段可能被旧路径污染。
   语义与旧 `git log -- <dir>` 完全一致：提交按时间倒序，目录首次出现即其最新提交（lastCommit=out[0]），
   commits = 触及该目录的不同提交数（一次提交内的多个文件只计一次）。
   git 缺失/出错时返回空表 —— 调用方据此把每条记录回落为 lastCommit:''/commits:0，与旧 gitMeta 的 catch 同姿。 */
function gitLogByDir(rootDir) {
  const map = new Map();
  let out;
  try {
    out = cp.execFileSync(
      'git',
      ['-c', 'core.quotePath=false', 'log', '--date=short', '--format=COMMIT%x09%ad', '--name-only', '--no-renames'],
      { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, // 实测全量输出约 3.6MB，留足冗余
    );
  } catch (e) { return map; }
  let date = '';
  let current = null; // 本提交触及的目录名集合；null = 尚未进入任何提交块
  const flush = () => {
    if (!current) return;
    for (const d of current) {
      const m = map.get(d);
      if (m) m.commits += 1; else map.set(d, { lastCommit: date, commits: 1 }); // 首现即最新提交
    }
    current = null;
  };
  for (const line of out.split('\n')) {
    if (line.startsWith('COMMIT\t')) { flush(); date = line.slice('COMMIT\t'.length); current = new Set(); continue; }
    const seg = line.trim() && line.split('/')[0]; // 空行 trim 为 ''（假值）跳过；路径取首段 = 顶层目录
    if (current && seg) current.add(seg);
  }
  flush(); // 收尾最后一个提交块
  return map;
}

function scanProjects(rootDir, opts = {}) {
  const useGit = opts.git !== false;
  const errors = opts.errors || [];
  const rows = [];
  let names;
  try { names = fs.readdirSync(rootDir); } catch (e) {
    errors.push(`无法读取扫描根 ${rootDir}: ${e.message}`);
    return rows;
  }
  // 整批读一次提交历史（git:false 时不产生任何子进程）；缺失目录不查得 → 记录保持默认 ''/0
  const gitByDir = useGit ? gitLogByDir(rootDir) : new Map();
  for (const dir of names) {
    if (EXCLUDE_DIRS.has(dir) || dir.startsWith('.')) continue;
    const full = path.join(rootDir, dir);
    try { if (!fs.statSync(full).isDirectory()) continue; } catch (e) { continue; } // 断链/无权限的条目跳过而非中断整轮扫描
    const target = projectDirOf(full);
    const flags = flagsOf(target);
    const kind = detectKind(flags);
    if (kind === 'unknown') continue;
    const manifest = readJson(target, 'manifest.json', errors);
    const { pages, subPackages, pageTitles } = countAndTitles(configOf(target, errors));
    const row = {
      dir,
      displayName: (manifest && manifest.name) || dir,
      kind,
      pages, subPackages, pageTitles,
      signals: collectSignals(full),
      vueVersion: (manifest && manifest.vueVersion) || '',
      lastCommit: '', commits: 0,
    };
    if (useGit) { const m = gitByDir.get(dir); if (m) Object.assign(row, m); }
    rows.push(row);
  }
  opts.errors = errors;
  // 码位序排序，不用 localeCompare —— 后者依宿主 locale，跨机器会让同页数行换序，导致生成物出现无意义 diff
  return rows.sort((a, b) => b.pages - a.pages || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

/* projectDirOf 与 SIGNALS 仅本模块内部使用（全仓 grep 无外部/测试引用），故不再导出。
   gitMeta 已被批量版 gitLogByDir 取代；导出它供测试断言 argv 形状。 */
module.exports = { parseJsonWithComments, detectKind, gitLogByDir, scanProjects, collectSignals };

if (require.main === module) {
  const opts = { errors: [] };
  const rows = scanProjects(ROOT_DIR, opts);
  if (opts.errors.some((e) => e.startsWith('无法读取扫描根'))) {
    /* 扫描根本身不可读时绝不落盘：否则会把已有的 data/projects.json 覆盖成空数组。
       ROOT_DIR 改走 resolveScanRoot() 之后，「根不可读」绝大多数已在 require 时被解析器拦下
       （那条报错还更具体：点名三条候选与三条纠正方式），留在这里的只有「解析成功 → 真正扫描」
       之间的竞态窗口（挂载点被撤、网络盘断开）。所以它不是死代码，是兜底。 */
    console.error(`扫描失败，未写出文件：${opts.errors.join('; ')}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(rows, null, 2) + '\n', 'utf8');
  console.log(`扫描 ${rows.length} 个项目 → ${OUTPUT_FILE}`);
  if (opts.errors.length) {
    console.warn(`配置解析失败 ${opts.errors.length} 个（已按 0 页/目录名回落处理）：`);
    opts.errors.slice(0, 10).forEach((e) => console.warn('  ' + e));
  }
}
