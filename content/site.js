/* 全站点唯一的个人身份信息来源。值为占位假数据，上线前必须替换。
   新增字段时同步在 SITE.占位 中登记，build.js 会打印待替换清单。
   约定：除本文件外，任何模板/脚本不得出现姓名、邮箱、电话、微信、GitHub 的具体值。
   about/now/experience 之外的一切事实性数字都来自 scripts/scan.js + scripts/curate.js 的实测结果。 */
const SITE = {
  name: '你的名字', // 占位
  tagline: 'uni-app 小程序与 H5 开发工程师',

  /* about 是自我介绍，不是仓库统计：这里不写「多少个工程 / 多少页 / 几类业务」那类数字，
     它们由 scan.js + curate.js 实测派生，出现在精选项目与技术栈旁边才有意义。
     曾经那句「84 个 uni-app 工程、51 个项目跑着同一套 request/ajax.js」的每个数字都可复算，
     复算口径与踩过的坑记在 docs/superpowers/specs/ 的追加段与 .superpowers/sdd 台账里，需要时可以查回来。
     另有一条硬约束：SITE 里任何散文都不许出现 YYYY-MM-DD 字面量（tests/content.test.js 钉住），
     日期一律由扫描的 lastCommit 渲染。 */
  about: '我是前端工程师，主要做小程序与 H5 的跨端开发。'
    + '从需求评审、交互确认、接口联调到打包提审和上线跟进，习惯一个人把一条产品线跑完整；'
    + '也在意别人接手时看不看得懂，所以重复出现的东西会抽成可复用的请求层、业务组件和工具函数。'
    + '动手前习惯先把链路画清楚：接口怎么定、状态放在哪、空数据和异常怎么表现，想明白再写代码比较少返工。'
    + '最近在往性能优化和工程化上多花时间，也补一些服务端侧的知识，好跟后端同学把接口一次谈清楚。',

  /* now 不写日期：日期是 scan.js 从 `git log -- <目录>` 取到的 lastCommit，已经由详情页 meta
     与归档跨度行渲染上屏；散文里再手抄一遍就成了「今天对、明天错」的硬编码——拼豆本周就被改过两次。
     tests/content.test.js 有一条断言禁止任何 SITE 字符串出现 `YYYY-MM-DD` 字面量（final review I-2）。 */
  now: '近期在推进拼豆小程序（canvas 图纸导出 + 手拼 SSE 进度流），'
    + '同时在维护水利地图的 live-player 云台监控。',

  experience: [
    { monogram: '某', name: '某科技公司', note: '多个小程序与 H5 项目的开发与维护，uni-app 一套代码同时出微信端与 H5', meta: '前端开发工程师 · 2022.06 — 至今', 占位: true },
    { monogram: '某', name: '某互联网公司', note: '电商平台前端与后台管理系统开发', meta: '前端开发实习生 · 2021.03 — 2022.05', 占位: true },
    { monogram: '学', name: '某大学', note: '计算机科学与技术 · 本科', meta: '2018.09 — 2022.06', 占位: true },
  ],

  contact: {
    name: '你的名字', // 占位
    email: 'your-email@example.com', // 占位
    phone: '+86 138****1234', // 占位
    wechat: 'your_wechat_id', // 占位
    github: 'github.com/yourusername', // 占位
  },

  /* 首页「技术」块：一份前端工程师常见技术栈，按招聘 JD 的分组口径写，不跟某个项目绑定，
     也不做扫描证据核对（上一版那种「来自 N 个项目」已经撤掉 —— 简历上的技术栈是自我描述，
     不是仓库统计）。这一整块是个人内容，面试时说不上来的行请直接删掉。 */
  techStack: [
    { name: '语言与基础', items: ['HTML5 / CSS3 语义化结构', 'JavaScript（ES6+）', 'TypeScript 基础与类型标注', '浏览器渲染原理与 DevTools 调试'] },
    { name: '框架与跨端', items: ['Vue 2 / Vue 3 组件化开发', 'uni-app 一套代码多端交付', '微信小程序原生开发', 'H5 与公众号网页、企业微信内嵌页'] },
    { name: '样式与界面', items: ['SCSS / LESS 预处理器与样式分层', 'Flex / Grid 布局', '移动端适配（rpx / rem / vw 与像素比）', '业务组件封装与主题定制'] },
    { name: '数据与网络', items: ['RESTful 接口设计与前后端联调', '请求层统一封装（拦截、鉴权、错误与重试）', 'token 与登录态管理、无感刷新', 'WebSocket 长连接与消息推送'] },
    { name: '工程化', items: ['Git 分支协作与代码评审', 'npm 依赖管理与私有包', 'Webpack / Vite 构建配置', '分包与按需加载、多环境与条件编译'] },
    { name: '性能与交付', items: ['首屏与长列表性能优化', '图片与静态资源压缩', '真机调试与主流机型兼容', '小程序提审、灰度与上架流程'] },
  ],

    avatar: 'img/avatar.png',

  /* 待替换清单：build.js（Task 7）按此表打印提醒。experience 三条整条为占位，合并成一个键。 */
  占位: ['name', 'contact.name', 'contact.email', 'contact.phone', 'contact.wechat', 'contact.github', 'experience[0-2]'],
};

module.exports = { SITE };
