const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseJsonWithComments, detectKind, gitLogByDir, scanProjects } = require('../scripts/scan.js');

const created = [];
after(() => created.forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

function mk(name, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  created.push(root); // 临时根必须登记，否则每轮测试泄漏 scan-* 目录（评审 M9）
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
  return root;
}

// 一个扫描根下放多个项目（kind 形态矩阵、portfolio 自排除用例需要）
function mkRoot(...projects) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  created.push(root);
  for (const [name, files] of projects) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }
  }
  return root;
}

// 注：mk 用 path.dirname(target) 递归建目录，'pages/a/a.vue' 这类嵌套路径才能写进去（Task 3 用例依赖）

test('parseJsonWithComments 去掉 JS 注释与尾逗号', () => {
  const o = parseJsonWithComments('{ "a": 1, // 行注释\n /* 块\n*/ "b": [1,2,], }');
  assert.deepStrictEqual(o, { a: 1, b: [1, 2] });
});

test('kind 判定五种形态', () => {
  assert.strictEqual(detectKind({ manifest: 1 }), 'uniapp');
  assert.strictEqual(detectKind({ app: 1, appWxss: 1 }), 'native-wx');
  assert.strictEqual(detectKind({ srcApp: 1, projectConfig: 1 }), 'webpack-subpackage');
  assert.strictEqual(detectKind({ composer: 1 }), 'php');
  assert.strictEqual(detectKind({ indexHtml: 1 }), 'static-site');
  assert.strictEqual(detectKind({}), 'unknown');
});

test('uniapp 页数含 subPackages，显示名取 manifest.name', () => {
  const root = mk('示例项目', {
    'manifest.json': '{ "name": "示例产品", "vueVersion": "2", "mp-weixin": { "appid": "wx1" } }',
    'pages.json': '{ "pages": [{ "path": "p/a", "style": { "navigationBarTitleText": "首页" } }],'
      + ' "subPackages": [{ "root": "s", "pages": [{ "path": "b", "style": { "navigationBarTitleText": "详情" } }]}] }',
  });
  const [row] = scanProjects(root, { git: false });
  assert.strictEqual(row.dir, '示例项目');
  assert.strictEqual(row.displayName, '示例产品');
  assert.strictEqual(row.kind, 'uniapp');
  assert.strictEqual(row.pages, 2);
  assert.strictEqual(row.subPackages, 1);
  assert.deepStrictEqual(row.pageTitles, ['首页', '详情']);
});

test('manifest 无 name 时回落目录名', () => {
  const root = mk('裸项目', { 'manifest.json': '{}', 'pages.json': '{ "pages": [] }' });
  assert.strictEqual(scanProjects(root, { git: false })[0].displayName, '裸项目');
});

test('parseJsonWithComments 不破坏字符串里的 // 与字符串内的逗号', () => {
  const src = '{\n "url": "https://api.example.com/Gushiwen/", // 目标接口域名\n "t": "a, ]",\n /* 块配置 */ "n": 1,\n}';
  assert.deepStrictEqual(parseJsonWithComments(src), {
    url: 'https://api.example.com/Gushiwen/', t: 'a, ]', n: 1,
  });
});

test('嵌套一层同名目录的项目也能识别（xcx-master 形态）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-nested-'));
  created.push(root);
  const inner = path.join(root, '超级项目', '超级项目', 'src');
  fs.mkdirSync(inner, { recursive: true });
  fs.writeFileSync(path.join(root, '超级项目', '超级项目', 'project.config.json'), '{ "appid": "wx2" }', 'utf8');
  fs.writeFileSync(path.join(inner, 'app.json'), '{ "pages": ["pages/a/a", "pages/b/b"] }', 'utf8');
  const row = scanProjects(root, { git: false })[0];
  assert.strictEqual(row.dir, '超级项目', 'dir 仍取顶层目录名');
  assert.strictEqual(row.kind, 'webpack-subpackage');
  assert.strictEqual(row.pages, 2);
});

test('git 取数是单次批量调用：argv 不掺入任何项目目录名，解析出正确的 lastCommit/commits', () => {
  const cp = require('node:child_process');
  const real = cp.execFileSync;
  const seen = [];
  let gitOut = '';
  cp.execFileSync = (cmd, args) => { seen.push([cmd, args]); return gitOut; };
  /* 目录名含空格、$() 与反引号：旧版靠 argv 传 pathspec 规避 shell 拆解；新版根本不把目录名喂给 git
     —— 它一次读全仓、按 `--name-only` 输出把提交归属到首段目录。因此「不经 shell 拆解」这条性质
     现在是结构性成立，而可证伪点转移到：(1) 整轮恰好一次 git 调用、(2) 任何 argv 元素都不含项目目录名
     （一旦有人退回把目录名拼成 pathspec/命令串，这里就红）、(3) 解析计数与逐目录 git log 一致。 */
  const proj = 'a b$(x)`y`';
  let calls, argv, row, noGitCalls;
  try {
    const root = mk(proj, { 'manifest.json': '{}', 'pages.json': '{ "pages": [] }' });
    // 桩输出：新提交触及本目录两个文件（commits 只 +1），旧提交触及别的目录。用真实 tab（\t）分隔 COMMIT 与日期。
    gitOut = `COMMIT\t2026-01-02\n\n${proj}/manifest.json\n${proj}/pages.json\n\nCOMMIT\t2025-12-30\n\n别的/x.js\n`;
    row = scanProjects(root)[0];
    calls = seen.length;
    argv = seen[0] && seen[0][1];
    seen.length = 0;
    gitOut = '';
    scanProjects(root, { git: false }); // { git:false } 必须零子进程
    noGitCalls = seen.length;
  } finally { cp.execFileSync = real; }

  assert.strictEqual(calls, 1, '整轮扫描应恰好一次批量 git 调用（不是每目录一次）');
  assert.strictEqual(noGitCalls, 0, '{ git: false } 竟仍发起了 git 子进程');
  assert.ok(Array.isArray(argv), '未捕获到 git 调用参数');
  assert.strictEqual(argv[0], '-c');
  assert.strictEqual(argv[1], 'core.quotePath=false');
  assert.ok(argv.includes('log'), '批量命令应以 git log 读取历史');
  for (const el of argv) {
    assert.ok(!el.includes(proj),
      `argv 元素把项目目录名掺进了命令（应批量读全仓再按输出归属）：${JSON.stringify(el)}`);
  }
  assert.strictEqual(row.lastCommit, '2026-01-02', 'lastCommit 取该目录出现的最新提交日期');
  assert.strictEqual(row.commits, 1, '一次提交内同目录多个文件只计一次提交');
});

test('批量 git 归属对真实历史正确：多个目录的 commits/lastCommit 与逐目录 git log 一致', (t) => {
  const cp = require('node:child_process');
  const repoRoot = require('../scripts/scan-root.js').resolveScanRoot(); // 与 scan.js 同一个解析器
  let perDir;
  try {
    perDir = (dir) => cp.execFileSync('git', ['log', '--format=%ad', '--date=short', '--', dir],
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim().split('\n').filter(Boolean);
    perDir('.'); // 先确认这里确实是 git 仓库，否则整条用例跳过
  } catch (e) { t.skip('无可用 git 环境，跳过真实历史核对'); return; }
  const map = gitLogByDir(repoRoot);
  // 抽样必须是「真有其历史」的目录。旧清单里的 scripts/ 与 content/ 是大仓顶层并不存在的名字，
  // 两边都数出 0，比对恒真、等于没测。现在这五个都有提交，其中 portfolio 只在历史里存在
  // （迁仓后工作树已无此目录）—— 那正是批量归属必须照样算对的一种形状。
  const dirs = ['水利地图', '体检', '数字人才签约码', 'xcx-master', 'portfolio'];
  for (const d of dirs) {
    const list = perDir(d);
    const want = { lastCommit: list[0] || '', commits: list.length };
    const got = map.get(d) || { lastCommit: '', commits: 0 };
    assert.deepStrictEqual(got, want, `目录 ${d} 的批量归属与逐目录 git log 不符`);
  }
});

test('记录形状是契约：键集合固定、signals 为空数组、vueVersion 有值', () => {
  const root = mk('契约项目', {
    'manifest.json': '{ "name": "契约", "vueVersion": "3" }',
    'pages.json': '{ "pages": [{ "path": "a", "style": { "navigationBarTitleText": "甲" } }] }',
  });
  const [row] = scanProjects(root, { git: false });
  assert.deepStrictEqual(Object.keys(row).sort(),
    ['commits', 'dir', 'displayName', 'kind', 'lastCommit', 'pageTitles', 'pages', 'signals', 'subPackages', 'vueVersion'].sort());
  assert.deepStrictEqual(row.signals, []);
  assert.strictEqual(row.vueVersion, '3');
});

test('原生小程序 / PHP / 静态站端到端可扫，且 portfolio 自身被排除', () => {
  const root = mkRoot(
    ['原生甲', { 'app.json': '{ "pages": ["pages/a/a", "pages/b/b"] }', 'app.wxss': '' }],
    ['php后台', { 'composer.json': '{}' }],
    ['静态站', { 'index.html': '<html></html>' }],
    ['portfolio', { 'manifest.json': '{ "name": "不该出现" }', 'pages.json': '{ "pages": [] }' }],
  );
  const kinds = Object.fromEntries(scanProjects(root, { git: false }).map((r) => [r.dir, r.kind]));
  assert.strictEqual(kinds['原生甲'], 'native-wx');
  assert.strictEqual(kinds['php后台'], 'php');
  assert.strictEqual(kinds['静态站'], 'static-site');
  assert.ok(!('portfolio' in kinds), 'portfolio 自身必须被排除');
});

test('pages.json 存在但解析失败：报 0 页且不冒充别种配置，并计入 errors', () => {
  const root = mkRoot(['坏配置', {
    'manifest.json': '{ "name": "坏配置" }',
    'pages.json': '{ pages: [[[ 不是合法 JSON',
    'app.json': '{ "pages": ["a", "b", "c"] }',
  }]);
  const errors = [];
  const [row] = scanProjects(root, { git: false, errors });
  assert.strictEqual(row.pages, 0, '解析失败不应回落到 app.json 的 3 页');
  assert.strictEqual(errors.length, 1);
});

test('BOM 前缀可解析', () => {
  assert.deepStrictEqual(parseJsonWithComments('\uFEFF{ "a": 1 }'), { a: 1 });
});

const { collectSignals } = require('../scripts/scan.js');

test('signals 命中支付/地图/canvas，并跳过 vendored 目录', () => {
  const root = mk('探针项目', {
    'manifest.json': '{}',
    'pages.json': '{ "pages": [] }',
    'pages/a/a.vue': '<template><map/><canvas/></template><script>uni.requestPayment({});uni.openBluetoothAdapter({})</script>',
    'uni_modules/mp-html/mp.js': 'uni.requestPayment should not count',
    'unpackage/dist/x.js': 'uni.connectSocket should not count',
  });
  const sig = collectSignals(path.join(root, '探针项目'));
  assert.ok(sig.includes('支付'));
  assert.ok(sig.includes('地图'));
  assert.ok(sig.includes('canvas'));
  assert.ok(sig.includes('蓝牙'));
  assert.ok(!sig.includes('IM'), 'unpackage 内的 websocket 不应被计入');
});

test('git:false 时不执行 git 且 commits 为 0', () => {
  const root = mk('小项目', { 'manifest.json': '{"name":"x"}', 'pages.json': '{ "pages": [] }' });
  const row = scanProjects(root, { git: false })[0];
  assert.strictEqual(row.commits, 0);
  assert.strictEqual(row.lastCommit, '');
});

// —— Task 2 复审追加的 CLI 守护（扫描根不可读 → 非 0 退出且不写出 data/projects.json）——

test('扫描根不可读：scanProjects 返回空行并推入「无法读取扫描根」错误', () => {
  const errors = [];
  const rows = scanProjects(path.join(os.tmpdir(), '不存在的扫描根-' + process.pid + '-' + Date.now()), { git: false, errors });
  assert.deepStrictEqual(rows, []);
  assert.strictEqual(errors.length, 1);
  assert.ok(errors[0].startsWith('无法读取扫描根'), errors[0]);
});

test('CLI 守护：扫描根不可读时 exit(1) 且不覆盖 data/projects.json', () => {
  // 做法：以 --require 预载脚本把真实 ROOT_DIR（仓库根）的 readdirSync stub 成抛错，
  // 再把 scripts/scan.js 作为 main 子进程跑真实 CLI，覆盖 require.main 块里的守护分支。
  // 单位级形态（scanProjects 返回 [] + errors）由上一条用例覆盖，本条专测「不写盘 + 非 0 退出」。
  // Task 2 接线后，「根一开头就不可读」改由 scan-root.js 在 require 时抛（另有用例覆盖）；
  // 本条把 stub 延后到解析器的探测之后才生效，正好钉住守护真正还剩下的那条路：
  // 解析时根可读、扫描那一刻不可读（竞态窗口）。
  const cp = require('node:child_process');
  const root = mk('守护占位', { 'manifest.json': '{}', 'pages.json': '{ "pages": [] }' });
  const preload = path.join(root, 'stub-unreadable-root.cjs');
  fs.writeFileSync(preload, [
    'const fs = require("fs"), path = require("path");',
    'const real = fs.readdirSync;',
    'const blocked = process.env.KX_STUB_UNREADABLE;',
    'let probes = 0;',
    'fs.readdirSync = function (p) {',
    '  if (blocked && path.resolve(String(p)) === path.resolve(blocked) && ++probes > 1) {',
    '    throw new Error("EACCES: 测试 stub");',
    '  }',
    '  return real.apply(fs, arguments);',
    '};',
  ].join('\n'), 'utf8');
  const repoRoot = require('../scripts/scan-root.js').resolveScanRoot(); // 与 scan.js 同一个解析器
  const artifact = path.resolve(__dirname, '../data/projects.json');
  // data/projects.json 迁仓后是未跟踪派生物，fresh clone 里可能根本不存在。
  // 缺它时「不覆盖」的正确说法是「不许凭空建出来」，所以存在性与内容都要守住。
  const readArtifact = () => (fs.existsSync(artifact) ? fs.readFileSync(artifact, 'utf8') : null);
  const before = readArtifact();
  const res = cp.spawnSync(process.execPath,
    ['--require', preload, path.resolve(__dirname, '../scripts/scan.js')],
    { encoding: 'utf8', env: Object.assign({}, process.env, { KX_STUB_UNREADABLE: repoRoot }) });
  assert.notStrictEqual(res.status, 0, '守护未生效：CLI 竟以 0 退出');
  assert.ok(res.stderr.includes('扫描失败，未写出文件'), res.stderr);
  assert.strictEqual(readArtifact(), before, '守护未生效：projects.json 被覆盖，或在缺它的机器上被凭空创建');
});

test('深层第一方源码不被丢弃；非标准 vendored 目录与压缩库被拦', () => {
  const root = mk('深层项目', {
    'manifest.json': '{}',
    'pages.json': '{ "pages": [] }',
    'a/b/c/d/e/f/deep.vue': '<template><video/></template>',            // 第 6 层，旧 depth>5 会静默丢掉
    'public/assets/libs/jquery-1.7.2.min.js': '<map></map> uni.requestPayment({})', // 非标准 vendored 目录 + 压缩库
    'public/assets/addons/summernote/summernote.js': 'uni.getRecorderManager({})',   // FastAdmin 插件目录，未压缩
    'public/js/own-scan.js': 'uni.scanCode({})',                          // 同一 public 下的第一方源码，必须保留
    'libs/sock.js': 'uni.connectSocket({})',
  });
  const sig = collectSignals(path.join(root, '深层项目'));
  assert.ok(sig.includes('视频'), '深层第一方源码的信号必须保留');
  assert.ok(sig.includes('扫码'), 'public/js 下的第一方源码不得被当成 vendored 剪掉');
  assert.ok(!sig.includes('地图'), 'libs 下的压缩库不得产出地图信号');
  assert.ok(!sig.includes('支付'), 'libs 下的压缩库不得产出支付信号');
  assert.ok(!sig.includes('录音'), 'addons 目录不得产出录音信号');
  assert.ok(!sig.includes('IM'), 'libs 目录不得产出 IM 信号');
});
