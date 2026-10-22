const test = require('node:test');
const assert = require('node:assert');
const { classify, curate, CATEGORIES } = require('../scripts/curate.js');

const r = (o) => Object.assign({ dir: 'x', displayName: 'x', kind: 'uniapp', pages: 30, subPackages: 0, pageTitles: [], signals: [], lastCommit: '', commits: 0 }, o);

test('分类三源投票：目录名 + 显示名 + 页面标题', () => {
  assert.strictEqual(classify(r({ dir: '生鲜积分商城' })), 'ecommerce');
  assert.strictEqual(classify(r({ dir: '水利地图', pageTitles: ['水库', '河道监控'] })), 'enterprise');
  assert.strictEqual(classify(r({ dir: 'gushici', pageTitles: ['古诗词', '国学', '故事'] })), 'content');
  assert.strictEqual(classify(r({ dir: '论坛', displayName: '论坛', pageTitles: ['帖子', '圈子'] })), 'social');
  assert.strictEqual(classify(r({ dir: '健身', pageTitles: ['课程', '训练记录', '会员中心'] })), 'service');
  assert.strictEqual(classify(r({ dir: '无名项目甲', displayName: '无名项目甲', pageTitles: [] })), 'other', '三源均无命中归 other，不再兜底成 tool');
});

test('非 uniapp 形态归 other-forms', () => {
  assert.strictEqual(classify(r({ dir: '青灵鹿', kind: 'static-site' })), 'other-forms');
  assert.strictEqual(classify(r({ dir: 'huadengshang', kind: 'php' })), 'other-forms');
});

test('入选门槛：pages>=10 或特殊形态或不可替代特征', () => {
  const recs = [
    r({ dir: 'A', pages: 30 }),
    r({ dir: 'B', pages: 4 }),
    r({ dir: 'C', pages: 2, signals: ['直播'] }),
    r({ dir: 'D', pages: 0, kind: 'php' }),
  ];
  const { archive } = curate(recs, { excludeDirs: [] });
  const names = archive.flatMap((g) => g.items.map((i) => i.dir));
  assert.ok(names.includes('A') && names.includes('C') && names.includes('D'));
  assert.ok(!names.includes('B'), '4 页且无特殊特征应被排除');
});

test('去重合并：杨扬佳运四份合并且标注份数', () => {
  const recs = ['杨扬佳运', '杨扬佳运2', '杨扬佳运3', '杨扬佳运4-优数'].map((d) => r({ dir: d, pages: 21 }));
  const { archive } = curate(recs, { excludeDirs: [] });
  const items = archive.flatMap((g) => g.items);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].merged, 4);
  assert.deepStrictEqual(items[0].mergedDirs, recs.map((x) => x.dir));
});

test('精选条目不出现在 archive；stats 汇总页数与年份跨度', () => {
  const recs = [r({ dir: '精选甲', pages: 50 }), r({ dir: '普通乙', pages: 20 })];
  const out = curate(recs, { excludeDirs: ['精选甲'] });
  assert.ok(!out.archive.flatMap((g) => g.items).some((i) => i.dir === '精选甲'));
  assert.strictEqual(out.stats.pages, 70);
  assert.strictEqual(out.stats.projects, 2);
});

test('合并组按整体页数判门槛：代表 6 页 + 同产品 6 页应整组入选', () => {
  const recs = [r({ dir: '桎选宠物', pages: 6 }), r({ dir: '桎选宠物-xcx', pages: 6 })];
  const items = curate(recs, { excludeDirs: [] }).archive.flatMap((g) => g.items);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].merged, 2);
  assert.strictEqual(items[0].pages, 6, '归档行仍显示代表项目自身页数，不虚报');
});

test('两组各 4 页的合并仍被门槛排除', () => {
  const recs = [r({ dir: 'postcard', pages: 2 }), r({ dir: '明信片', pages: 2 })];
  const items = curate(recs, { excludeDirs: [] }).archive.flatMap((g) => g.items);
  assert.strictEqual(items.length, 0, '整组 4 页不足以入选');
});

test('NAME_OVERRIDE 与 MERGE 必须落在真实存在的目录上', () => {
  const { scanProjects } = require('../scripts/scan.js');
  const { NAME_OVERRIDE, MERGE } = require('../scripts/curate.js');
  const dirs = new Set(scanProjects(require('../scripts/scan-root.js').resolveScanRoot(), { git: false }).map((r) => r.dir));
  for (const d of Object.keys(NAME_OVERRIDE)) assert.ok(dirs.has(d), `NAME_OVERRIDE 键不存在：${d}`);
  for (const m of MERGE) {
    assert.ok(dirs.has(m.keep), `MERGE keep 不存在：${m.keep}`);
    for (const d of m.merged) assert.ok(dirs.has(d), `MERGE merged 不存在：${d}`);
  }
});

test('curate 可重复调用：第二次传子集不得残留上一次的合并元数据', () => {
  const recs = ['杨扬佳运', '杨扬佳运2', '杨扬佳运3', '杨扬佳运4-优数'].map((d) => r({ dir: d, pages: 21 }));
  curate(recs, { excludeDirs: [] });
  const items = curate([recs[0], recs[3]], { excludeDirs: [] }).archive.flatMap((g) => g.items);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].merged, 2, '只剩两份时必须报「合并 2」，而不是上一轮的「合并 4」');
  assert.deepStrictEqual(items[0].mergedDirs, ['杨扬佳运', '杨扬佳运4-优数']);
});

// 下面两条是重置修复的真正判别性用例：只有合并主机在场（无任何 MERGE 成员）时，
// 陈旧 merged 会谎报份数，陈旧 members 会让够不上门槛的 host 冒名入选。
test('只剩合并主机时不得残留份数', () => {
  const recs = ['杨扬佳运', '杨扬佳运2', '杨扬佳运3', '杨扬佳运4-优数'].map((d) => r({ dir: d, pages: 21 }));
  curate(recs, { excludeDirs: [] });
  const items = curate([recs[0]], { excludeDirs: [] }).archive.flatMap((g) => g.items);
  assert.strictEqual(items.length, 1, 'host 自身 21 页，应凭实力列出');
  assert.strictEqual(items[0].merged, 0, '输入里没有任何成员，份数必须归 0');
  assert.deepStrictEqual(items[0].mergedDirs, []);
});

test('不足门槛的合并主机单独传入时不得入选', () => {
  const recs = [r({ dir: '桎选宠物', pages: 6 }), r({ dir: '桎选宠物-xcx', pages: 6 })];
  curate(recs, { excludeDirs: [] });
  const items = curate([recs[0]], { excludeDirs: [] }).archive.flatMap((g) => g.items);
  assert.strictEqual(items.length, 0, '6 页主机 + 已消失的成员 = 不该用上一轮的页数凑数');
});

test('stats 区分目录数、合并后项目数与归档列出数', () => {
  const recs = [
    r({ dir: '甲', pages: 30 }),
    r({ dir: '乙', pages: 20 }),
    r({ dir: '丙', pages: 3 }),
  ];
  const { stats } = curate(recs, { excludeDirs: ['乙'] });
  assert.strictEqual(stats.dirs, 3);
  assert.strictEqual(stats.projects, 3);
  assert.strictEqual(stats.listed, 1, '丙 未过门槛、乙 被排除，只剩甲');
});

/* final review I-1 要求 curate 把「合并后的那一份记录列表」也交出去：
   首页同时写「共 81 个项目（已合并）」与「X 来自 N 个项目」，两处必须是同一个基数，
   而这个基数只存在于 curate 内部。stats 的五个键保持原样（口径没变，只是多返回一份数据）。 */
test('curate 额外返回 mergedRecords：与 stats.projects 同基数，被合并掉的目录不在其中', () => {
  const recs = [
    r({ dir: '杨扬佳运', pages: 21 }), r({ dir: '杨扬佳运2', pages: 21 }),
    r({ dir: '杨扬佳运3', pages: 21 }), r({ dir: '杨扬佳运4-优数', pages: 21 }),
    r({ dir: 'gushici', pages: 67, kind: 'uniapp' }), r({ dir: 'gushi', pages: 52, kind: 'native-wx' }),
    r({ dir: 'guoxue', pages: 64, kind: 'native-wx' }), r({ dir: '普通乙', pages: 20 }),
  ];
  const out = curate(recs, { excludeDirs: [] });
  const dirs = out.mergedRecords.map((x) => x.dir);
  assert.strictEqual(new Set(dirs).size, dirs.length, 'mergedRecords 里出现了重复目录');
  assert.strictEqual(out.mergedRecords.length, out.stats.projects, 'mergedRecords 必须就是 stats.projects 的那一份基数');
  assert.strictEqual(out.stats.projects, 3, '8 个目录里 杨扬佳运×4 与 gushi/guoxue→gushici 各并成一条，应剩 3 个项目');
  assert.strictEqual(out.stats.dirs, 8, 'stats.dirs 仍是扫描目录数，不随合并变化');
  for (const d of ['杨扬佳运', 'gushici', '普通乙']) assert.ok(dirs.includes(d), `代表目录不该被丢掉：${d}`);
  for (const d of ['杨扬佳运2', '杨扬佳运3', '杨扬佳运4-优数', 'gushi', 'guoxue']) {
    assert.ok(!dirs.includes(d), `被合并掉的目录不该留在统计集合里：${d}`);
  }
  // 返回的必须是记录本身（带 kind/signals），否则下游 countTech 无从统计
  assert.ok(out.mergedRecords.every((x) => 'kind' in x && Array.isArray(x.signals)), 'mergedRecords 退化成了目录名或摘要');
  assert.deepStrictEqual(out.mergedRecords.find((x) => x.dir === 'gushici').mergedDirs, ['gushici', 'gushi', 'guoxue']);
  // stats 的五个键不得被顺手改掉（首页统计行直接插值它们）
  assert.deepStrictEqual(Object.keys(out.stats).sort(), ['dirs', 'listed', 'pages', 'projects', 'span']);
});

test('excludeDirs 只影响归档列出数，不影响 mergedRecords（技术计数与项目总数须同基数）', () => {
  const recs = [r({ dir: '精选甲', pages: 50 }), r({ dir: '普通乙', pages: 20 }), r({ dir: '丙', pages: 3 })];
  const withExclusion = curate(recs, { excludeDirs: ['精选甲'] });
  const plain = curate(recs, { excludeDirs: [] });
  assert.strictEqual(withExclusion.stats.listed, plain.stats.listed - 1, '夹具异常：排除项没减少列出数');
  assert.strictEqual(withExclusion.stats.projects, plain.stats.projects, '项目总数含精选，排除它不该改动合并基数');
  assert.deepStrictEqual(withExclusion.mergedRecords.map((x) => x.dir), plain.mergedRecords.map((x) => x.dir),
    'mergedRecords 被 excludeDirs 影响了：技术计数会与「共 N 个项目」不同基数');
});

test('CATEGORIES 覆盖所有分组键', () => {
  const ids = CATEGORIES.map((c) => c.id);
  assert.deepStrictEqual(ids, ['ecommerce', 'service', 'enterprise', 'content', 'social', 'tool', 'other', 'other-forms']);
});
