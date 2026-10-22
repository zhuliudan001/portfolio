/* 策展规则：分类投票 → 入选门槛 → 去重合并 → archive 分组 */
const CATEGORIES = [
  { id: 'ecommerce', name: '电商' },
  { id: 'service', name: '生活服务' },
  { id: 'enterprise', name: '企业与园区' },
  { id: 'content', name: '内容' },
  { id: 'social', name: '社交' },
  { id: 'tool', name: '工具' },
  { id: 'other', name: '未归类' },
  { id: 'other-forms', name: '其他形态' },
];
const categoryName = (id) => CATEGORIES.find((c) => c.id === id).name;

const KEYWORDS = {
  ecommerce: ['商城', '电商', '购物', '商品', '订单', '积分', '生鲜', '女鞋', '云仓', '分销', '外卖', '拼团', '快印'],
  service: ['健康', '医疗', '养生', '健身', '家政', '维修', '保洁', '快递', '物流', '出行', '旅游', '酒店', '餐饮', '美食', '蛋糕', '咖啡', '预约', '租车', '保险', '房产', '网签', '退休', '体检', '营地', '访客', '门禁', '停车'],
  enterprise: ['企业', '园区', '空间', '巡检', '任务', '派发', '办公', 'OA', 'CRM', 'ERP', '财务', '人事', '考勤', '审批', '年报', '工商', '水库', '河道', '水利', '实业', '技术', 'iot', '电表', '水表', '门锁'],
  content: ['传媒', '资讯', '古诗词', '国学', '故事', '短视频', '视频', '音频', '音乐', '阅读', '小说', '新闻', '博客', '素材', '文创', '展览', '记忆', '旧', '诗', '词'],
  social: ['社交', '论坛', '社区', '陪玩', '宠物', '交友', '婚', '圈子', '帖子', '直播互动'],
  tool: ['工具', '查询', '计算器', '工资', '股票', '天气', '地图', '导航', '翻译', '扫描', '识别', '转换', '生成', '定位', '图纸', '拼豆'],
};

function vote(text, id) {
  return KEYWORDS[id].reduce((n, kw) => n + (text.includes(kw) ? 1 : 0), 0);
}

/* 三源投票：目录名权重 3（作者自己的项目命名最可靠）、显示名权重 2、页面标题权重 1。
   signals 不参与投票 —— 它含泛化噪声（i18n、泛化 canvas），早期版本给 tool 加过分，已删。 */
function classify(record) {
  if (record.kind !== 'uniapp' && record.kind !== 'native-wx') return 'other-forms';
  const sources = [[record.dir, 3], [record.displayName, 2], [record.pageTitles.join(' '), 1]];
  let best = 'other', bestScore = 0;
  for (const id of Object.keys(KEYWORDS)) {
    let score = 0;
    for (const [text, weight] of sources) score += vote(String(text || '').toLowerCase(), id) * weight;
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return bestScore > 0 ? best : 'other';
}

/* manifest.name 为泛称/内部编号时的人工覆盖，键为目录名 */
const NAME_OVERRIDE = {
  灵猫健康服务: '灵猫健康服务', // manifest 名为泛称「蓝牙设备」
  慢病档案: '慢病档案', // manifest 名「星级评定1.0版」是客户内部版本编号
  定位器小程序: '定位器小程序',
};

const showName = (record) => NAME_OVERRIDE[record.dir] || record.displayName || record.dir;

/* 同模板换皮与重复交付：键为保留的代表目录，值为被合并的目录列表 */
const MERGE = [
  { keep: '杨扬佳运', merged: ['杨扬佳运2', '杨扬佳运3', '杨扬佳运4-优数'], note: '同模板 4 家店铺换皮交付' },
  { keep: 'postcard', merged: ['明信片'], note: '同一产品（声动昆山）的两个版本' },
  { keep: '桎选宠物', merged: ['桎选宠物-xcx'], note: '同项目的两套代码' },
  { keep: 'gushici', merged: ['gushi', 'guoxue'], note: '古诗词/国学内容线，另含 2 个原生小程序版本' },
  { keep: '工商年报-339', merged: ['大丙企服-工商年报'], note: '同一工商年报产品的前后两版' },
  { keep: '港澳租车原新改', merged: ['港澳租车司机端原新改'], note: '乘客端与司机端双端交付（该条目为精选，司机端不再单列归档）' },
];

function applyMerges(records) {
  const byDir = new Map(records.map((r) => [r.dir, r]));
  const absorbed = new Set();
  for (const m of MERGE) {
    const host = byDir.get(m.keep);
    if (!host) continue;
    const extra = m.merged.filter((d) => byDir.has(d));
    if (!extra.length) continue;
    host.merged = extra.length + 1;
    host.mergedDirs = [m.keep, ...extra];
    host.members = extra.map((d) => byDir.get(d)); // 供 qualifies 汇总整组规模
    host.mergeNote = m.note;
    extra.forEach((d) => absorbed.add(d));
  }
  return records.filter((r) => !absorbed.has(r.dir));
}

const ACCEPT = new Set(['直播', '蓝牙', 'SSE']);

function qualifiesOne(r) {
  return r.pages >= 10 || r.kind === 'static-site' || r.kind === 'php' || r.kind === 'webpack-subpackage'
    || r.signals.some((s) => ACCEPT.has(s));
}

/* 合并组按整体判门槛：入选门槛问的是「有没有足够实质内容」，去重只是不重复列同一个产品。
   代表项目自身 6 页 + 同产品另一套 6 页 = 12 页的活，不该因为「先合并、后判门槛」而整条消失。
   归档行仍显示代表项目自身页数 + 「合并 N 份」，不虚报规模。 */
function qualifies(r) {
  if (qualifiesOne(r)) return true;
  const total = (r.members || []).reduce((sum, m) => sum + m.pages, r.pages);
  return total >= 10;
}

function curate(records, { excludeDirs = [] } = {}) {
  /* 合并元数据每次重算前无条件清空：同一批记录可能被再次传入（不同 excludeDirs、或子集），
     残留的 merged/members 既会报出错误的「合并 N 份」，也会让 qualifies 用在输入之外的页数凑过门槛。 */
  for (const rec of records) {
    delete rec.merged; delete rec.mergedDirs; delete rec.members; delete rec.mergeNote;
  }
  const merged = applyMerges(records.slice());
  const skip = new Set(excludeDirs);
  const kept = merged.filter((x) => qualifies(x) && !skip.has(x.dir));
  const groups = new Map();
  for (const r of kept) {
    const id = classify(r);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({
      dir: r.dir, name: showName(r), pages: r.pages, category: id, signals: r.signals,
      merged: r.merged || 0, mergedDirs: r.mergedDirs || [],
    });
  }
  const archive = CATEGORIES
    .filter((c) => groups.has(c.id))
    // 页数相同的行加 dir 次级键，让归档顺序由本模块自己保证，而不是依赖上游 scan.js 的排序
    .map((c) => ({ id: c.id, name: c.name, items: groups.get(c.id).sort((a, b) => b.pages - a.pages || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0)) }));
  const dates = records.map((r) => r.lastCommit).filter(Boolean).sort();
  return {
    featured: [], // 由 content/featured.js 提供，curate 只负责校验 dir 命中
    archive,
    /* 合并之后的记录列表 = stats.projects 的那一份基数（同产品多份交付只留代表目录，含精选，不受 excludeDirs 影响）。
       下游任何「来自 N 个项目」的统计都必须用它，而不是原始 records —— 首页同时说「共 81 个项目（已合并）」
       和「来自 84 个项目」就是同一页两个「项目」含义（final review I-1）。 */
    mergedRecords: merged,
    stats: {
      dirs: records.length,        // 扫到的项目目录数（含同产品的多份交付）
      projects: merged.length,     // 合并同产品多份交付之后的项目数
      listed: kept.length,         // 归档实际列出的行数（过了门槛、未被 excludeDirs 排除）
      pages: merged.reduce((s, r) => s + r.pages, 0),
      span: dates.length ? `${dates[0].slice(0, 4)}–${dates[dates.length - 1].slice(0, 4)}` : '未知',
    },
  };
}

module.exports = { CATEGORIES, categoryName, classify, curate, NAME_OVERRIDE, MERGE };
