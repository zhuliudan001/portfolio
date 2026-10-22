# 作品集 — uni-app 跨端开发

编辑式单栏静态站，版式参考 [preetsuthar.me](https://preetsuthar.me)。内容来自被扫描仓库（扫描根，见「扫描根」一节）兄弟项目的自动扫描，构建期生成 HTML，零运行时依赖；首页有一段内联 canvas 脚本驱动巡游鲨鱼，其余产物无 JS。

## 用法

**`build` 与 `test` 都不依赖 `data/projects.json`。** 它们是现扫扫描根的 —— `build.js` 直接调 `scan.js`
的 `scanProjects()`，全仓唯一读那个 JSON 的是 `tests/scan.test.js` 里「守护不许写盘」那条用例，而它在文件
缺席时按「也不许凭空建出来」断言。`scan.js` 写下的是一份给人核数的快照：想复核产物上的数字就得先跑它，
但不跑也照样能构建与测试。实测（把它移走）：全量 122 pass / 0 fail，`node scripts/build.js` 退出码 0
且没有把它重建出来，聚合哈希不变。

node scripts/scan.js      # 只读扫描「扫描根」（见下一节）→ data/projects.json
node scripts/build.js     # 生成 index.html 与 case/*.html
node --test "tests/*.test.js"        # 断言：分类、去重、对比度、依据路径
python -m http.server 8080 # 或直接双击 index.html（file:// 可用）

新增/删除项目后只需重跑前两条。

改鲨鱼：只动 scripts/shark-motion.js（它会被原样内联进首页），不要动 index.html。

### 扫描根（portfolio 不在被扫描仓库里面时必读）

统计数字来自扫描另一个仓库（默认假设 portfolio 住在它下面一层）。三种指定方式，按优先级：

1. 环境变量 `PORTFOLIO_SCAN_ROOT=/绝对/路径/到/被扫描仓库`
2. 在 portfolio 根写未跟踪的 `scan-root.local.json`：`{"root": "D:/开发/ke-xianyongs-project"}`
3. 什么都不做 —— 退回 `../..`（仅当 portfolio 仍在被扫描仓库内时成立）

三条都不成立时，凡在加载期解析扫描根的（`scan.js`、`build.js` 及其调用方测试）都会抛错并列出上面三条；
不解析扫描根的用例（如纯 CSS 断言）仍能跑。这是有意的：
宁可拒绝重建，也不要让 `data/projects.json` 悄悄停在旧快照上。

显式指定的那条路（env 或配置文件）本身指向不可扫的目录时同样抛错，不会被别的候选悄悄换掉 ——
构建成功但扫错仓库的产物，比一条报错难查得多。

**优先级有个必须先修再跑的细节**：配置文件只要存在就会被读取，所以它哪怕 JSON 写坏、`root` 为空，
也会让构建直接抛错 —— **即使 env 已经给了正确路径，也救不回来**。方向是「更大声」，不是静默，
但别把它读成「有 env 就可以不管那个文件」。先修好或删掉它。

## 改内容

- 个人信息（姓名、联系方式、经历）：`content/site.js` —— 全站点唯一需替换处，字段带 `占位: true`
- 精选项目、一句话、要点与 accent：`content/featured.js`（每条要点必须带真实代码路径依据）
- 入选门槛、去重合并、领域分类：`scripts/curate.js`
- 首页「技术」块：`content/site.js` 的 `SITE.techStack` —— 一份按招聘 JD 口径写的**前端通用技术栈**（六组，语言与基础 / 框架与跨端 / 样式与界面 / 数据与网络 / 工程化 / 性能与交付），纯个人内容，不跟项目走、不做扫描计数核对。`build.js` 只校验形状（分组有名、条目是非空字符串）。这一整块是自我描述，面试时说不上来的行请直接删掉
- 首页「关于」块：`SITE.about` 是**自我介绍**（这个角色、方向、工作方式），不放仓库统计数字；那些数字要看得懂口径才有意义，需要时从 `data/projects.json` 现算
- 首页只有六个区块：关于 / 近期 / 精选项目 / 经历 / 技术 / 联系。「全部项目」归档模块已按要求移除，38 个未入选项目不再上站（数据仍在 `data/projects.json`）
- 版式与配色：`css/style.css`
- 品牌标记与 favicon：`img/avatar.png`（256px 方块，页面上按 48px 显示）与 `img/favicon.png`（32px），**黑白线条画鲨鱼头**：白纸黑墨线稿，头顶与口内点局部墨块，圆头 + 顶上一刀背鳍 + 两只大圆眼 + 宽笑两排交错牙 + 两侧腮缝条纹。两档尺寸各自从母本 `img/avatar-source.png`（1024px，不引用、不上站）导出，别拿 256 那张直接当 favicon。换图：`powershell -File scripts/export-avatar.ps1 -Source img/avatar-source.png -Avatar img/avatar.png -Favicon img/favicon.png`，再把 `SITE.avatar` 指过去；路径写错会在 `node scripts/build.js` 阶段直接报错，不会静默丢图。日后要放真实照片同理
