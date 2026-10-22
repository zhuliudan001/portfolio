/* 扫描根解析器：portfolio 搬出大仓之后，"往上两层"不再必然指向被扫描的仓库。
   契约是「解析不出来就大声失败」—— 静默降级会让 data/projects.json 悄悄停在
   旧快照上，而整个作品集的立身之本是每个数字都可复算。
   三条候选路径都用 opts 注入，不依赖 portfolio 此刻住在哪；最后一条例外，
   它故意不注入 env，就是要让 process.env 那行兜底真的被走一遍。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveScanRoot, scanRootProvenance, SCAN_ROOT_ENV, LOCAL_CONFIG_FILE, DEFAULT_ROOT } =
  require('../scripts/scan-root.js');

/* 守卫谓词：一行若同时提到 __dirname 且含至少两个上级 .. 段，就是在自行算「往上两层」的扫描根。
   只钉单一字面量等于给未来留旁路 —— join 形式把两段拆成两个参数、resolve 形式再拼一段，
   算的都是同一个根，却绕得过旧正则。scan.js/build.js 那条守卫与本文件 tests/ 那条共用此谓词：
   锁保护的是「计算」这个动作，不是某一种写法。 */
const computesTwoLevels = (line) => /__dirname/.test(line) && (line.match(/\.\./g) || []).length >= 2;

/* 脏环境守卫读的是「本文件加载时」的快照，不是测试体执行时的实时值：同文件里的 process.env 用例
   会临时改 PORTFOLIO_SCAN_ROOT，此刻只靠 node:test 串行才不出事。守卫意图是「import 期解析是否被
   污染」，所以 env 值与 config 是否存在都必须在模块作用域求值，否则照样受用例顺序影响。 */
const ENV_AT_LOAD = process.env[SCAN_ROOT_ENV];
const CONFIG_AT_LOAD = fs.existsSync(LOCAL_CONFIG_FILE);
/* 搬迁后配置文件是本机必需项，「脏」的定义随之改变：不再是「它存在」，而是「两条显式来源互相矛盾」。
   这里只取它的 root 用来比对 —— 不做 ../..、不绕过解析器，所以不构成第二处扫描根计算。
   相对写法按配置文件所在目录展开，与解析器同法，否则比对会假红。 */
const CONFIG_ROOT_AT_LOAD = (() => {
  if (!CONFIG_AT_LOAD) return null;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(LOCAL_CONFIG_FILE, 'utf8')).root; } catch (e) { return 'unreadable'; }
  return (typeof raw === 'string' && raw.trim())
    ? path.resolve(path.dirname(LOCAL_CONFIG_FILE), raw.trim())
    : 'unreadable';
})();

const tmp = [];
test.after(() => { tmp.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); });
function sandbox() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kx-scan-')); tmp.push(d); return d; }

/* 造一个「像被扫描仓库」的目录树：有 .git，且至少一个子目录带 manifest/pages/app.json */
function fakeRepo(name = 'repo') {
  const dir = path.join(sandbox(), name);
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'demo-app'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'demo-app', 'manifest.json'), '{}\n');
  return dir;
}
const NO_ENV = '';            // 显式空值 = 不提供（比 delete 更好断言）
const absentFile = (name) => path.join(sandbox(), name, 'not-written.json');

test('env 优先于配置文件，配置文件优先于默认值', () => {
  const byEnv = fakeRepo('a'); const byFile = fakeRepo('b'); const byDefault = fakeRepo('c');
  const cfg = path.join(sandbox(), 'cfg', 'scan-root.local.json');
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  fs.writeFileSync(cfg, JSON.stringify({ root: byFile }));
  const opts = { configFile: cfg, defaultRoot: byDefault };

  assert.strictEqual(resolveScanRoot({ ...opts, env: byEnv }), fs.realpathSync(byEnv));
  assert.strictEqual(scanRootProvenance({ ...opts, env: byEnv }).source, 'env');
  assert.strictEqual(resolveScanRoot({ ...opts, env: NO_ENV }), fs.realpathSync(byFile));
  assert.strictEqual(scanRootProvenance({ ...opts, env: NO_ENV }).source, 'local-file');
  assert.strictEqual(resolveScanRoot({ ...opts, env: NO_ENV, configFile: absentFile('nope') }), fs.realpathSync(byDefault));
  assert.strictEqual(scanRootProvenance({ ...opts, env: NO_ENV, configFile: absentFile('nope2') }).source, 'default');
});

test('配置文件里的相对路径按该配置文件自身所在目录展开', () => {
  const home = sandbox();
  const repo = fakeRepo('target');
  const cfg = path.join(home, 'scan-root.local.json');
  const rel = path.relative(home, repo);
  fs.writeFileSync(cfg, JSON.stringify({ root: rel }));
  assert.strictEqual(resolveScanRoot({ env: NO_ENV, configFile: cfg, defaultRoot: absentFile('d') }),
    fs.realpathSync(repo));
  assert.strictEqual(LOCAL_CONFIG_FILE, path.resolve(__dirname, '..', 'scan-root.local.json'));
});

test('根不存在 / 不是 git 仓库 / 没有可扫项目：三种都抛，且各说清原因', () => {
  const missing = path.join(sandbox(), 'never-created');
  assert.throws(() => resolveScanRoot({ env: missing, configFile: absentFile('x1'), defaultRoot: missing }),
    /不存在|无法读取/);

  const notGit = path.join(sandbox(), 'plain');
  fs.mkdirSync(path.join(notGit, 'demo-app'), { recursive: true });
  fs.writeFileSync(path.join(notGit, 'demo-app', 'manifest.json'), '{}');
  assert.throws(() => resolveScanRoot({ env: notGit, configFile: absentFile('x2'), defaultRoot: notGit }),
    /不是 git 仓库/);

  const emptyGit = path.join(sandbox(), 'empty');
  fs.mkdirSync(path.join(emptyGit, '.git'), { recursive: true });
  assert.throws(() => resolveScanRoot({ env: emptyGit, configFile: absentFile('x3'), defaultRoot: emptyGit }),
    /没有可扫描的项目/);
});

test('抛错消息必须同时点名三条纠正路径，否则等于让人自己猜', () => {
  const bad = path.join(sandbox(), 'bad');
  assert.throws(() => resolveScanRoot({ env: bad, configFile: absentFile('y'), defaultRoot: bad }), (e) => {
    assert.ok(e.message.includes(SCAN_ROOT_ENV), `消息没提环境变量名 ${SCAN_ROOT_ENV}：${e.message}`);
    assert.ok(e.message.includes('scan-root.local.json'), `消息没提配置文件写法：${e.message}`);
    assert.ok(e.message.includes('../..'), `消息没提默认值：${e.message}`);
    return true;
  });
});

test('配置文件写成非法 JSON 或缺 root 时，报出文件本身而不是静默退回默认值', () => {
  const repo = fakeRepo('z');
  const broken = path.join(sandbox(), 'broken', 'scan-root.local.json');
  fs.mkdirSync(path.dirname(broken), { recursive: true });
  fs.writeFileSync(broken, '{root: ');
  assert.throws(() => resolveScanRoot({ env: NO_ENV, configFile: broken, defaultRoot: repo }),
    /scan-root\.local\.json/);
  fs.writeFileSync(broken, JSON.stringify({ nope: 1 }));
  // 只认「缺 root 字段」这句原话：泛化的 /root/ 连「找不到可扫描的仓库根」的
  // 纠正方式②（{"root": "..."}）都能匹配，等于是条不区分的断言。
  assert.throws(() => resolveScanRoot({ env: NO_ENV, configFile: broken, defaultRoot: repo }),
    /缺非空的 root 字段/);
});

/* 上面五条全靠 opts 注入，于是生产上真正生效的两行反倒没人管：candidates() 里
   读 process.env 的那句兜底、和 DEFAULT_ROOT 的字面量本身。删掉兜底、或把
   ../.. 手滑写成 ..，全套照样绿 —— 这条就是钉这两行的。
   顺带钉注入语义：判定用「有没有传这个键」，所以 defaultRoot: '' 是「传了空值」，
   不许被换成生产默认值（此刻它是个合法仓库，正是 Task 2/3 断言的假绿通道）。 */
test('不注入 env 时真的读 process.env；DEFAULT_ROOT 钉在 ../..；空串注入不换回生产默认值', () => {
  assert.strictEqual(DEFAULT_ROOT, path.resolve(__dirname, '../..'),
    `DEFAULT_ROOT 不等于 portfolio 上两层（${DEFAULT_ROOT}）—— 默认值字面量被改写了`);

  const repo = fakeRepo('ambient');
  const saved = process.env[SCAN_ROOT_ENV];
  process.env[SCAN_ROOT_ENV] = repo;
  const opts = { configFile: absentFile('envcfg'), defaultRoot: absentFile('envdef') };
  try {
    assert.strictEqual(resolveScanRoot(opts), fs.realpathSync(repo));
    assert.strictEqual(scanRootProvenance(opts).source, 'env');
    // 包装脚本里的尾随空格（PORTFOLIO_SCAN_ROOT="D:\repo "）必须同配置文件一样 trim，
    // 否则这条候选会变成一句谁也看不懂的 ENOENT。
    process.env[SCAN_ROOT_ENV] = repo + '  ';
    assert.strictEqual(resolveScanRoot(opts), fs.realpathSync(repo));
  } finally {
    if (saved === undefined) delete process.env[SCAN_ROOT_ENV];
    else process.env[SCAN_ROOT_ENV] = saved;
  }

  // '' 也算「传了值」：必须按注入值展开成 portfolio 目录，不许换回生产默认值
  // （今天默认值是个合法仓库，一旦静默换过去，Task 2/3 的「解析不出即抛」断言就假绿）。
  const portfolioDir = fs.realpathSync(path.resolve(__dirname, '..'));
  assert.throws(() => resolveScanRoot({ env: NO_ENV, configFile: absentFile('dr'), defaultRoot: '' }),
    (e) => {
      const line = e.message.split('\n').find((l) => l.trim().startsWith('- default:'));
      assert.ok(line && line.trim().startsWith(`- default: ${portfolioDir}`),
        `defaultRoot: '' 应展开为 portfolio 目录 ${portfolioDir}，实际候选是「${line}」—— 说明空串被当成了没注入`);
      return true;
    });
});

/* Task 4 Step 1：三个注入口必须同法按「有没有传这个键」判定。
   这里把 env / configFile / defaultRoot 全注入「明确不提供」的值（'' 或没写出来的路径），
   契约是仍然抛「找不到可扫描的仓库根」。|| 形状下这条会活体假绿：
   configFile: '' 被换成 LOCAL_CONFIG_FILE 之后，搬迁后（Task 5 建出那个文件）解析器会去读
   开发者本机真实仓库路径并「成功返回」—— 于是断言测的是环境而不是行为。 */
test('configFile 注入空串算「传了空值」，不许换成真实的本机配置文件', () => {
  const missing = path.join(sandbox(), 'never-a-scan-root');
  assert.throws(() => resolveScanRoot({ env: '', configFile: '', defaultRoot: missing }),
    /找不到可扫描的仓库根/);
});

/* Task 4 Step 1b：显式来源（env / 配置文件）失效时，不许被别的候选悄悄救回。
   生产侧 scan.js/build.js 把 source 丢掉、全仓无人调用 scanRootProvenance，
   所以「打错一个字母 → 构建成功但扫错仓库」在产物上是零信号，报错是唯一能出声的地方。
   这正好是上面那批用例没覆盖的组合：显式候选失败 + 另一个候选可用。 */
test('显式 env 指向不可扫目录时必须抛，即使默认根可用也不许静默退回 default', () => {
  const typo = path.join(sandbox(), 'env-typo');            // 「打错一个字母」的形状
  const repo = fakeRepo('explicit-env-default-ok');
  const opts = { env: typo, configFile: absentFile('explicit-env-cfg'), defaultRoot: repo };
  assert.throws(() => resolveScanRoot(opts), /扫描根被显式指定但不可用：env →/,
    '显式 env 不可用时静默退回 default，产物会扫错仓库而不报任何信号');
  assert.throws(() => scanRootProvenance(opts), /它本来会被 default（.+）救回/,
    '报错必须点名是哪条候选把它救回来的');
});

test('显式配置文件指向不可扫目录时同样抛，且报错点名 local-file', () => {
  const home = sandbox();
  const notGit = path.join(home, 'explicit-file-bad-root');
  fs.mkdirSync(path.join(notGit, 'demo-app'), { recursive: true });   // 缺 .git → inspect 判「不是 git 仓库」
  const cfg = path.join(home, 'scan-root.local.json');
  fs.writeFileSync(cfg, JSON.stringify({ root: notGit }));
  const repo = fakeRepo('explicit-file-default-ok');
  assert.throws(() => resolveScanRoot({ env: NO_ENV, configFile: cfg, defaultRoot: repo }),
    /扫描根被显式指定但不可用：local-file →/,
    '配置文件里写错了路径时，defaultRoot 不该把它救回来');
});

test('scripts/ 全目录都不得自己算上级的扫描根，一律走解析器', () => {
  const dir = path.resolve(__dirname, '../scripts');
  // 解析器是唯一被允许做上级展开的文件；同目录及其一层子目录里的每个 JS 都纳管。
  // 旧写法是硬写两个文件名 —— 那等于「8 个脚本守 2 个」，新加一个脚本就能悄悄长出第二处计算。
  // 纳管扩展名含 .cjs/.mjs：本仓的测试 stub 就用 .cjs；.ps1 不在 JS 语法内，另说。
  const OWNER = 'scan-root.js';
  for (const rel of ['scan.js', 'build.js']) {
    const src = fs.readFileSync(path.join(dir, rel), 'utf8');
    assert.ok(/require\(['"]\.\/scan-root\.js['"]\)/.test(src), `${rel} 没引 scan-root.js`);
  }
  const hitLines = (src) => src.split('\n')
    .map((line, i) => (computesTwoLevels(line) ? i + 1 : 0))
    .filter((n) => n > 0);
  const walk = (d, prefix) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) return walk(path.join(d, e.name), rel);        // 只递归一层以上由递归本身覆盖
    return /\.(js|cjs|mjs)$/.test(e.name) ? [rel] : [];
  });
  const files = walk(dir, '');
  const ownerHits = hitLines(fs.readFileSync(path.join(dir, OWNER), 'utf8'));
  // 「唯一所有者」不能只靠文件名豁免：那个文件自己也可以长出第二处不同形状的展开。
  // 钉的是「恰好一条，且它就是 DEFAULT_ROOT 那行」—— 不钉行号（注释加一行就会误红）。
  assert.strictEqual(ownerHits.length, 1,
    `解析器 ${OWNER} 里的上级展开应恰好一处（现命中 ${ownerHits.length} 处：行 ${ownerHits.join(',')}）。`
      + ' 多于一条 = 同一个所有者里两套根；一条都没有 = 默认值不再来自上两级，README 的第三条与全仓的默认行为都失实。');
  const ownerLine = fs.readFileSync(path.join(dir, OWNER), 'utf8').split('\n')[ownerHits[0] - 1];
  assert.ok(/DEFAULT_ROOT/.test(ownerLine),
    `${OWNER} 唯一那处上级展开（第 ${ownerHits[0]} 行）必须是 DEFAULT_ROOT 的定义，实际是：${ownerLine.trim()}`);
  const offenders = files
    .filter((rel) => rel !== OWNER)
    .map((rel) => ({ file: rel, lines: hitLines(fs.readFileSync(path.join(dir, rel), 'utf8')) }))
    .filter((e) => e.lines.length > 0);
  assert.deepStrictEqual(offenders, [],
    `这些脚本仍自己算上级的根（命中行号点名）：${offenders.map((e) => `${e.file}:${e.lines.join(',')}`).join(' ')}\n`
      + '  两处各算一次早晚变成两套事实；根只有一个所有者，就是同目录的解析器。\n'
      + '  注意谓词分不清代码与注释：把本目录变量与两个上级段写进同一行就算命中，'
      + '要解释为什么禁止这种写法就用文字描述，别在这一行写出可执行的形状。');
});

test('tests/ 里不得再出现第二处扫描根计算', () => {
  const dir = path.resolve(__dirname, '..', 'tests');
  const self = path.basename(__filename);
  /* 本文件豁免必须逐行核销，不许整文件放行：谓词在本文件只命中一条真实代码行 ——
     「DEFAULT_ROOT 必须等于 ../..」的金丝雀（那串字面量本身就是被测对象）。
     上一条守卫原先的报错文案也命中过一行，Task 4 之后它改成文字描述写法，命中随之消失；
     若再新增第二处，照红。 */
  const SELF_EXEMPT = [
    "assert.strictEqual(DEFAULT_ROOT, path.resolve(__dirname, '../..')",
  ];
  // 条数核销（Task 4 Step 1c）：白名单一旦可扩，「每条片段各命中 1 行」就拦不住松动 ——
  // 加一条能匹配现有某行真实代码的片段，逐条命中数照样满足，豁免表每多一行锁就松一分。
  // 所以这里钉成恰好一条（2026-10-22 终审后从两条降到一条：删掉的是那条已不再命中的旧文案）。
  // 要加第二条，必须先让那处上级计算有正当理由并同步改本断言 —— 这是一次可见的决定，不是顺手贴字符串。
  assert.strictEqual(SELF_EXEMPT.length, 1,
    `SELF_EXEMPT 有 ${SELF_EXEMPT.length} 条，本守卫只豁免那一条已核销的金丝雀行：`
    + '新增豁免=新增一处扫描根计算，先想清楚它凭什么正当，再连同本断言一起改');
  // 命中数必须核销：某片段命中 0 行说明白名单与被测代码已脱钩（文案被改），命中 >1 说明豁免在扩散。
  // 白名单条目自身的声明行也算「包含该片段」，须先剔掉，否则每条恒为 2 —— 剔完仍要求恰好命中 1 行
  // （即那一条真正被测的代码行），保证「片段 ↔ 代码」一对一，脱钩或复制都会红。
  const selfLines = fs.readFileSync(__filename, 'utf8').split('\n');
  /* 声明行比较必须先归一化（Task 4 Step 1d②）。白名单条目的排版（双引号→单引号、尾随逗号、
     尾随注释 `"<frag>", // 金丝雀`）是纯格式改动，跟「白名单与被测代码是否脱钩」无关；
     不归一化就会让那条片段多算一行命中，报出「已脱钩」这句误导的红，或者把声明行自己
     当成一处扫描根计算。归一化只认「整行就是一条条目」这种形状：剥行尾注释 → 剥尾随逗号 →
     剥成对的外层引号 → 还原 \' / \" 转义（片段里带引号时换引号必须转义）。
     被豁免的那条代码行不以引号开头，所以永远不会被误判成声明行。 */
  const asEntry = (line) => {
    let t = line.trim().replace(/\/\/.*$/, '').trim();  // 剥行尾注释（注释前常留一个空格，故再 trim 一次）
    t = t.replace(/,+$/, '').trim();                    // 剥尾随逗号
    const m = /^(['"])([\s\S]*)\1$/.exec(t);            // 只认「整行就是一条带引号的条目」
    return m ? m[2].trim().replace(/\\(['"])/g, '$1') : null; // 还原换引号时不得不加的转义
  };
  const isDeclaration = (line) => {
    const t = asEntry(line);
    return t !== null && SELF_EXEMPT.some((frag) => t === frag);
  };
  SELF_EXEMPT.forEach((frag) => {
    const hits = selfLines.filter((line) => !isDeclaration(line) && line.includes(frag)).length;
    assert.strictEqual(hits, 1,
      `豁免片段「${frag}」在本文件命中 ${hits} 行（不计白名单声明行），应为恰好 1 行 —— 白名单与被测代码已脱钩，须重新对齐`
      + '（若只是排版改动而红：条目行必须整行就是一条字符串，可带尾随逗号或行尾注释）');
  });
  const offenders = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.join(dir, f))
    .filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      if (path.basename(f) !== self) return src.split('\n').some(computesTwoLevels);
      // 声明行本身（条目里带 `'../..'`，换引号还得转义）也算谓词命中，但它不是第二处解析：
      // 白名单的声明位置先剔掉，剩下的每一处命中都必须被某条片段解释。
      return src.split('\n').some((line) => computesTwoLevels(line)
        && !isDeclaration(line) && !SELF_EXEMPT.some((frag) => line.includes(frag)));
    });
  assert.deepStrictEqual(offenders, [],
    `这些测试仍自己算 ../.. ：${offenders.map((f) => path.basename(f)).join(', ')}`);
});

/* 套件的确定性挂在环境上，不在代码里（scan.js/build.js 是 import 期解析）——
   与其悄悄清理，不如在来源互相矛盾时拒绝跑。判据在搬迁前后是两个意思：
   旧位置「配置文件存在」本身就是脏（会把套件带走扫别处）；新位置它是必需项，
   于是真正会骗人的形状变成「env 与配置文件同时存在且指向不同目录」—— 解析器按优先级取 env，
   开发者以为自己在测配置文件指的那个仓。终审裁定：这条必须在新家仍然会咬，不许永久空转。 */
const PORTFOLIO_ROOT = path.resolve(__dirname, '..');
// 两侧都过 realpath 再比，且按大小写不敏感比：解析器自己就是这么归一的（toAbs 走 realpathSync）。
// 用裸字符串比会偏严假红 —— 盘符大小写、8.3 短名、junction 指向同一仓都会被当成矛盾。
const asRootKey = (p, base) => {
  const abs = path.resolve(base, p);
  let real;
  try { real = fs.realpathSync(abs); } catch (e) { real = abs; }
  return process.platform === 'win32' ? real.toLowerCase() : real;
};
test('测试必须在干净扫描环境下跑', (t) => {
  // 断言读的是本文件加载时的快照 ENV_AT_LOAD / CONFIG_ROOT_AT_LOAD，不是测试体执行时的实时值：
  // 守卫生命周期锚在「import 期解析有没有被污染」，同文件其它用例会临时改这两个来源。
  const envRoot = (ENV_AT_LOAD && ENV_AT_LOAD.trim()) ? asRootKey(ENV_AT_LOAD.trim(), PORTFOLIO_ROOT) : null;
  if (CONFIG_AT_LOAD && CONFIG_ROOT_AT_LOAD === 'unreadable') {
    throw new Error(`${LOCAL_CONFIG_FILE} 存在却读不出非空的 root —— 它必须是 {"root": "路径"}。`
      + '坏配置文件会连同 env 一起把 import 期解析炸掉，先修它再跑套件。');
  }
  const cfgRoot = CONFIG_AT_LOAD ? asRootKey(CONFIG_ROOT_AT_LOAD, path.dirname(LOCAL_CONFIG_FILE)) : null;
  if (envRoot && cfgRoot && envRoot !== cfgRoot) {
    throw new Error(`两条显式来源指向不同仓库：${SCAN_ROOT_ENV}=${envRoot} 而 ${LOCAL_CONFIG_FILE} → ${cfgRoot}。`
      + '解析器会取 env，于是同一套件测的不是你以为的那个仓库 —— 二者留一个，或把它们对齐。');
  }
  if (!envRoot && !cfgRoot && !fs.existsSync(path.join(DEFAULT_ROOT, '.git'))) {
    throw new Error(`两条显式来源都没有，而默认值上两级 = ${DEFAULT_ROOT} 也不是 git 仓库：`
      + `按 README 设 ${SCAN_ROOT_ENV} 或写 ${LOCAL_CONFIG_FILE} 再跑。`);
  }
  // 已知盲区（终审复算，非本报告夸大）：只有一条显式来源、而它指向另一份「同样可扫」的 clone 时，
  // 本判据无从判断 —— 它与期望仓字面不同却没有对照物。那种状态里唯一信号就是下面这行打印出来的根。
  return t.diagnostic(`扫描根来源：${envRoot ? `env=${envRoot}` : (cfgRoot ? `config=${cfgRoot}` : `default=${DEFAULT_ROOT}`)}`);
});
