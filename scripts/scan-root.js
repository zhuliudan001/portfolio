/* 扫描根的唯一解析点。portfolio 原本住在大仓里，"往上两层"就是被扫描的仓库根；
   搬成同级独立仓之后这个等式不再成立，所以把「根在哪」收进这一个文件，
   其余地方一律 require 它 —— 两处各算一次 ../.. 早晚变成两套事实。
   解析顺序：env PORTFOLIO_SCAN_ROOT > scan-root.local.json（未跟踪）> ../.. 默认值。
   三条路都不成立时抛错，不静默回退：整个作品集的立身之本是每个数字都可复算，
   悄悄用陈旧 data/projects.json 比报错难查得多。
   opts 只给测试注入口用（生产调用一律不传）：不注入的话，"默认值成立"与
   "默认值不成立"两类断言会随 portfolio 住在哪儿给出不同结果 —— 那是在测环境，不是测行为。 */
const fs = require('fs');
const path = require('path');

const SCAN_ROOT_ENV = 'PORTFOLIO_SCAN_ROOT';
const PORTFOLIO_DIR = path.resolve(__dirname, '..');
const LOCAL_CONFIG_FILE = path.join(PORTFOLIO_DIR, 'scan-root.local.json');
const DEFAULT_ROOT = path.resolve(__dirname, '../..');

/* 一个目录能不能当扫描根：可读 → 是 git 仓库（取提交日期要用）→ 至少一个子项目可识别。
   三条各给一句 why，因为报错的价值就在于让人知道下一步改哪条。 */
function inspect(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return { ok: false, why: `不存在或无法读取（${e.code || e.message}）` }; }
  if (!fs.existsSync(path.join(dir, '.git'))) return { ok: false, why: '不是 git 仓库（缺 .git），取不到提交日期' };
  const scannable = entries.some((ent) => {
    if (!ent.isDirectory() || ent.name === '.git' || ent.name === 'node_modules') return false;
    return ['manifest.json', 'pages.json', 'app.json']
      .some((f) => fs.existsSync(path.join(dir, ent.name, f)));
  });
  return scannable ? { ok: true } : { ok: false, why: '没有可扫描的项目（子目录里找不到 manifest.json / pages.json / app.json）' };
}

/* 展开成绝对路径并走 realpath（Windows 短名 / 符号链接都要归一，否则断言比不过）。
   但路径不存在时不在这里下结论：交给 inspect 说「不存在或无法读取」——
   那里的报错才点得出「哪一条候选、为什么」，而 realpathSync 只会丢 ENOENT。 */
function toAbs(p, baseDir) {
  const abs = path.resolve(baseDir, p);
  try { return fs.realpathSync(abs); }
  catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return abs; throw e; }
}

function candidates(opts) {
  /* 三个注入口同法按「有没有传这个键」判定（!== undefined），不用 || 判真值：
     || 会把 '' 当成没传，于是注入的空串静默换成生产值 —— 今天生产默认根是个合法仓库、
     本机配置文件在搬迁后也确实存在，那条假绿通道正好喂给「解析不出即抛」的断言。
     （configFile 这侧原先写的是 ||，理由是「该文件此刻不存在、'' 与不提供等价」。
       Task 5 一旦真的建出 scan-root.local.json，那个前提就没了 —— Task 4 把它翻齐。） */
  const env = opts.env !== undefined ? opts.env : process.env[SCAN_ROOT_ENV];
  const configFile = opts.configFile !== undefined ? opts.configFile : LOCAL_CONFIG_FILE;
  const out = [];
  // env 与配置文件的值同法 trim：包装脚本里 `PORTFOLIO_SCAN_ROOT="D:\repo "` 这种
  // 尾随空格不该变成一条 ENOENT 记录混进失败清单。
  if (env) out.push({ source: 'env', dir: env.trim() });
  if (fs.existsSync(configFile)) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(configFile, 'utf8')); }
    catch (e) { throw new Error(`${configFile} 解析失败：${e.message}（它必须是 {"root": "路径"}）`); }
    if (!parsed || typeof parsed.root !== 'string' || !parsed.root.trim()) {
      throw new Error(`${configFile} 缺非空的 root 字段，应为 {"root": "路径"}`);
    }
    // 相对 root 按配置文件所在目录展开：生产里配置文件就躺在 portfolio 根，
    // 与 PORTFOLIO_DIR 同义；注入别的 configFile 时（测试）它才是那个文件的目录。
    out.push({ source: 'local-file', dir: parsed.root.trim(), base: path.dirname(configFile) });
  }
  out.push({ source: 'default', dir: opts.defaultRoot !== undefined ? opts.defaultRoot : DEFAULT_ROOT });
  return out;
}

function pick(opts = {}) {
  const tried = [];
  // 第一条失效的显式候选（env 或 local-file）。它失败后若被别的候选救活，必须抛：
  // 打错一个字母得到一个「构建成功但扫错仓库」的产物，比报错难查得多。
  // 不在失败那一刻抛 —— 那样会吞掉下面「三条都不成立」的汇总报错（那是另一条契约）。
  let explicitFailure = null;
  for (const c of candidates(opts)) {
    let abs;
    try { abs = toAbs(c.dir, c.base || PORTFOLIO_DIR); }
    catch (e) {
      tried.push({ source: c.source, dir: c.dir, why: `路径无法解析（${e.code || e.message}）` });
      if (c.source !== 'default' && !explicitFailure) explicitFailure = { source: c.source, dir: c.dir, why: `路径无法解析（${e.code || e.message}）` };
      continue;
    }
    const verdict = inspect(abs);
    if (verdict.ok) {
      if (explicitFailure) {
        throw new Error(`扫描根被显式指定但不可用：${explicitFailure.source} → ${explicitFailure.dir}\n  ${explicitFailure.why}`
          + `\n  它本来会被 ${c.source}（${abs}）救回，但显式指定不该被别的路径悄悄换掉 —— 请改正或删除它。`);
      }
      return { root: abs, source: c.source };
    }
    tried.push({ source: c.source, dir: abs, why: verdict.why });
    if (c.source !== 'default' && !explicitFailure) explicitFailure = { source: c.source, dir: abs, why: verdict.why };
  }
  // 以下汇总报错（remedies + tried）保持原样，一字不改。
  const remedies = [
    `① 设环境变量 ${SCAN_ROOT_ENV}=<被扫描仓库的绝对路径>`,
    `② 在 portfolio 根写 ${LOCAL_CONFIG_FILE}（未跟踪）：{"root": "<仓库绝对路径>"}`,
    '③ 把 portfolio 放回被扫描仓库的下一层目录（默认值就是 ../..）',
  ].join('\n  ');
  throw new Error('找不到可扫描的仓库根。已试过：\n'
    + tried.map((t) => `  - ${t.source}: ${t.dir} → ${t.why}`).join('\n')
    + `\n纠正方式（任选一条）：\n  ${remedies}`);
}

function resolveScanRoot(opts) { return pick(opts).root; }
function scanRootProvenance(opts) { return pick(opts); }

module.exports = { resolveScanRoot, scanRootProvenance, SCAN_ROOT_ENV, LOCAL_CONFIG_FILE, DEFAULT_ROOT };
