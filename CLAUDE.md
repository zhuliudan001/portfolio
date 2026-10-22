# CLAUDE.md — portfolio

编辑式单栏静态作品集（参考 preetsuthar.me）。构建期由 Node 脚本扫描「扫描根」仓库里的兄弟 uni-app 项目、生成纯 HTML（零运行时依赖；首页有一段内联 canvas 脚本驱动巡游鲨鱼，其余产物无 JS）。无 package.json、无构建工具链，Node ≥ 18 直接跑脚本。

## 管线

```
node scripts/scan.js        # 只读扫描扫描根（见下条陷阱）→ data/projects.json
node scripts/build.js       # 策展 + 断言 → index.html 与 case/*.html
node --test "tests/*.test.js"
```

文件职责：`scripts/scan.js`（识别项目、页数、signals、git 元信息）、`scripts/curate.js`（分类/去重/NAME_OVERRIDE）、`scripts/template.js`（HTML 模板）、`scripts/build.js`（入口与断言）、`content/site.js` + `content/featured.js`（人工内容）、`css/style.css`（版式配色）。

## 已知陷阱（实测所得）

- 扫描根由 `scripts/scan-root.js` 单点解析：`PORTFOLIO_SCAN_ROOT` > 未跟踪的 `scan-root.local.json` > `../..`。解析不出即抛错（设计选择：拒绝重建优于用陈旧快照）；显式指定的那条路指向不可扫目录时同样抛，不会被别的候选悄悄换掉。**守卫范围要认清**：`tests/scan-root.test.js` 那两条文本守卫只读 `scripts/scan.js`、`scripts/build.js` 和 `tests/*.test.js`，别处（`scripts/curate.js`、`scripts/template.js`、`content/*.js`、今后新建的 `scripts/` 文件）写出第二处根计算**不会被拦**，而且谓词只认「同一行出现 `__dirname` 与两个 `..`」——`path.dirname(path.dirname(__dirname))` 这类等价写法也不命中。加新脚本时自己守住「只 require 解析器」。
- portfolio 已搬出 ke-xianyongs-project 成同级独立仓，`../..` 默认值因此**不再自动成立** —— 新机器上 clone 完必须先按 README 的三条之一指路。搬迁当天实测（把配置文件移走后跑套件）：总数从 122 掉到只数出 77，5 条 fail = **四个测试文件整文件加载失败**（`build.test.js`、`content.test.js`、`gate.test.js`、`scan.test.js` —— 它们加载期就要解析扫描根）+ `curate.test.js` 里那条依赖扫描根数据的断言（`NAME_OVERRIDE 与 MERGE 必须落在真实存在的目录上`），其余 71 条不碰扫描根的用例照样绿。**别拿「还有很多绿灯」当「配置没问题」** —— 少掉的那 45 条和 4 个不存在的文件名才是信号。`build.js` 同样退出码 1 并列出三条纠正方式；失败过程不写任何产物（`data/projects.json` 与 11 份 HTML 的指纹前后一致）。这是预期行为，不是环境坏了。
- **提交兄弟项目的改动之后，必须回来 `node scripts/build.js` 重建再提交一次。** 详情页的 `lastCommit` 是 `git log -- <目录>` 现取的，提交本身会把日期推到今天，盘上产物随即比生成结果旧一天，`gate.test.js` 的「盘上 11 份产物与重新生成逐字节一致」会红。2026-10-15 实测踩过：第一次提交后该断言即失败，重建后再提交才绿。推论——聚合哈希只在「刚重建完」这一刻有意义，跨提交比对要先重建。
- `signals` 探针必须跳过 `unpackage`、`node_modules`、`.mimocode`、`uni_modules`，否则第三方插件（`mp-html`、`uni-popup`）会伪造 IM/录音/支付信号。（`scan.js` 另跳过 `static`、`vendor` 与 `libs/dist/build/addons` 等 vendored 目录名。）
- `displayName` 来自 `manifest.json.name`，它有时是客户品牌名或内部编号（`蓝牙设备`、`星级评定1.0版`），泛称由 `NAME_OVERRIDE`（`scripts/curate.js`）人工覆盖。
- 页面产物为生成物，手改会被覆盖；`points[].依据` 指向兄弟项目目录，重构兄弟项目后需重跑断言。
- `portfolio/.kilo/worktrees/` 是工具副本（34k 文件），扫描与 grep 都要排除，也不要删。`.superpowers/` 是各次重构的计划与 SDD 台账（任务简报、实现报告、评审 diff、我的裁定记账），**搬迁后已移出版本控制、只在本机存在** —— 这份仓里查不到它，别按图索骥；扫描与 grep 同样排除、勿删。`data/projects.json` 也移出了跟踪（它是扫描派生物，含被扫仓库全部目录名与提交日期），fresh clone 里没有这个文件，跑 `node scripts/scan.js` 才会出现。
- 这是一个**个人简历页**，不是仓库统计报表：首页「关于」写自我介绍（角色、方向、工作方式），「技术」写一份招聘口径的通用前端技术栈（`content/site.js` 的 `SITE.techStack`，六组）。两处都不做扫描核对、不带「来自 N 个项目」那种计数 —— 自我描述不需要仓库背书，`assertContext` 只校验形状（分组有名、条目是非空字符串）。历史上做过两版证据机制（技术块直接投影扫描计数 → 每条带 `依据` 核实测），2026-10-14 按用户要求全部撤掉，`scan.js` 为它加的五条前端向探针也一并回退。
- 数字仍然有它们的位置：精选项目的「N 页」、详情页的形态与技术列、页面描述里的项目总数，都由 `scan.js` + `curate.js` 派生，禁止手写。`stats.projects` 用合并口径（81）不是目录数（90），这条有守卫。
- 首页**没有归档模块**（用户要求移除，测试里有反向断言钉住）：`curate()` 仍返回 `archive` 与 `stats`，但只有 `stats.projects` 被 `<meta description>` 用着，38 个未入选项目不再上站，全量数据仍在 `data/projects.json`。
- 品牌标记是**位图**：`img/avatar.png`（256px，页面按 48px 显示）与 `img/favicon.png`（32px），**黑白线条画鲨鱼头**（白纸黑墨线稿 + 头顶与口内局部墨块：圆头、顶上一刀背鳍、两只大圆眼、宽笑两排交错牙、两侧腮缝条纹）。重导出用 `scripts/export-avatar.ps1`（System.Drawing 居中裁方 + HighQualityBicubic），母本存在 `img/avatar-source.png`（1024px，不引用、不上站）。换到位图后 SVG 时代那条「浅色态必须写成呈现属性」的规则已作废（颜色烤死在像素里，不执行 CSS 的渲染器也不会变一团黑），`content.test.js` 改按 PNG 签名 + IHDR 宽高核对。`.masthead` 是两列网格：头像占第 1 列并跨两行，姓名与定位在第 2 列上下叠放，`column-gap: 14px`、垂直居中（要改回竖排只需把 `display: grid` 那几行删掉并给 `.avatar` 补回 `margin-bottom`）。
- 头像要**平面 + 高对比 + 少量大形**，用户已明确否掉 3D 质感。实测判据：① 金属渐变、铆钉、高光缩到 48px 会糊成噪声、32px 只剩一团灰；② 明度分布比画法更要紧 —— 大面积浅银的精修徽章在 48px 反而最弱，深色主体 + 少量高对比点缀才撑得住；③ 反白（白线刻黑底）能不能用**取决于线宽不取决于方向**：细线版画样本 32px 碎成噪声，粗笔触刮画则眼与牙都读得出来（上一轮「反白路线不成立」的结论据此收回）；④ 深色 tile 落在 `#0e0e0e` 页面上确实会丢边界，结果是标记直接浮在页面上，观感比一块亮 box 更干净，记为可接受而非缺陷；⑤ **纯线稿必须配局部墨块** —— 无填充的白纸线描在 48px 几乎整张消失、32px 成一片淡斑，只有头顶与口内点上实心黑才撑得住；纸色 tile 落在 `--bg:#fff` 上近乎隐形，反而比深色版更像直接画在页面上。改图后必须**按真实 48/32 像素**看一遍再定，别按 1024 母本判断。
- 看深色模式**不要**用 Edge 的 `--force-dark-mode`：它对深色页上的深色图片有自动反相启发，会把黑头像洗成白团，测出来的是假象。正确做法是复制一份 `masthead` 片段到探针页，用后写的 `:root { --bg:#0e0e0e; --fg:#ececec; --muted:#8e8e8e; --rule:#262626; }` 覆盖 token（同特异度、靠后生效），走正常渲染。
- 首页那段内联 `<script>` 的**内容就是 `scripts/shark-motion.js` 去掉末尾 `module.exports` 的原文**。所以那个文件不得引入任何依赖、不得出现第二处导出（构建期直接抛错）；改了它必须 `node scripts/build.js` 重建，否则 `首页内联的鲨鱼脚本与 shark-motion.js 源码同源` 会红。
- 运行时 JS 的允许范围是**只有 index.html、只有 1 段**。10 份 `case/*.html` 仍由断言钉死为零 JS —— 长文阅读页加动效是另一回事，别顺手复用首页那段。

## 约定

- 生成物（`index.html`、`case/*.html`、`data/projects.json`）只由脚本产出，禁止手工编辑。
- 个人信息占位符集中在 `content/site.js`，带 `占位: true` 标记，`build.js` 会打印待替换清单。
