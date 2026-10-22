/* 精选项目策展数据。points[].依据 必须是仓库内真实代码路径（相对仓库根），且必须指向「具体文件」而非目录，
   由 tests/content.test.js 逐条校验：fs.existsSync + statSync().isFile()、不落 vendored 目录、
   components/<tag>/<tag>.vue 与 utils、store 下的 .js 依据还要被同项目别的文件引用
   （git grep -l，并排除 unpackage / node_modules / uni_modules：构建产物里的标签与路径字符串不算接线）。写不出这种依据的要点删除。
   页数、分包数、领域一律不在此手写——由 scan.js + curate.js 派生（同一测试文件里有正则哨兵）。
   accent 每组 light 对白字、dark 对 #0e0e0e 均 >= 4.5:1（同一测试文件校验），必须写成 #rrggbb 小写，不得简写。
   以下每条要点都在 2026-10-13 打开过对应文件核对：与代码不符的已改写，指向 vendored 代码（uni_modules / 第三方组件副本）的已改指第一方页面。
   round-1 换入的「健身（臻动力）」：组件目录存在 ≠ 已接线——草稿点名的 components/custom-barrage 在全项目里 0 处引用、
   渲染循环整段注释、模板里还留着「点击/关闭」调试按钮，故弹幕那条改指实际被 training-thase 页使用的 components/l-barrage。
   round-2 补的三条纪律：① 依据落在「文件存在」还不够，未被任何页面 import 的第一方文件同样不算证据
   （灵猫 utils/bluetooth.js 全站 0 引用且写的是 wx.* 而非 uni.*，已换成真被测试页 import 的 bluetoothManager.js）；
   ② 代码结构为真但跑不通的链路不许承诺（bluetoothManager.js:61 把 services 写成未定义标识符简写，
   发起搜索那条腿永远 reject，所以文案只写适配器/连接/断开这些站得住的部分；:65 onBluetoothDeviceFound 与
   :76 handleDeviceFound 都挂在这条死腿的 success 回调里，连「按 deviceId 去重」也承诺不了）；③ 引号里的界面文字逐字抄代码。
   round-3 裁定 A：灵猫 headline 不再以蓝牙开头——蓝牙那条支撑不住一个精选位的门面（调试页在 pages.json:159 有注册，
   但全项目 grep "bluetooth-test" 只命中这一行，无任何跳转入口）。oneLine 改为写在主流程里的三件事：
   站点预约（pages/book-now/book-now.vue:200 起「选择站点」跳 pages/book-site/book-site.vue，后者用 eventChannel 回传 selectSiteInfo；
   日期与时段格子按「已预约/不可约/已约 N 人」三态渲染，book-now.vue:72-91）、
   健康登记（info-register 两步表单 → sign/sign.vue 签字回传 → health_add）、推广收益（promotion-revenue/my-income 已结算/待结算 + 提现）。
   蓝牙要点保留，但把「独立的调试页、主流程走不到它」写在句子开头。
   round-4 补的三条纪律：① 计数哨兵同时拦汉字数词（从前只查 \d，放过了 I3/I2 点名的中文写法），文案里「数字或数词 + 页/分包」一律算手写计数；
   ② utils|store 下的 .js 依据必须被同项目别的文件按路径引用——生鲜/健身 的 store 只在 main.js 里以 './store' 导入、按路径查不到引用，
   那两条要点因此改指真正消费这些 state 的组件（navbar-top / custom-countdown），西有空间/store/index.js 由 request/ajax.js 按路径导入故保留；
   ③ 接线检查排除 unpackage / node_modules / uni_modules —— 构建产物里的 <tag> 与路径字符串不算第一方证据。 */
const FEATURED = [
  {
    dir: '飞鹰传媒', slug: 'feiying-media', name: '飞鹰传媒', monogram: '飞',
    accent: { light: '#b45309', dark: '#fbbf24' },
    oneLine: '沙龙、圈子与团购内容平台',
    points: [
      { text: '下单按支付方式分流：余额方式先弹六位支付密码、未设密码时引导去设置，微信方式直接进 requestPayment', 依据: '飞鹰传媒/buy-orders/confirm-order/confirm-order.vue' },
      { text: '支付密码独立成弹层组件，输满六位回传事件，并挂「找回支付密码」跳转', 依据: '飞鹰传媒/components/payment-password/payment-password.vue' },
      { text: '分享海报走 canvas 合成：远程图先 getImageInfo 预载，正文用 measureText 逐字折行截断后导出相册', 依据: '飞鹰传媒/components/share-poster/share-poster.vue' },
      { text: '听书页把拖动百分比折算成秒后调 audioContext.seek，实现进度跳转', 依据: '飞鹰传媒/mengbao-zone/audio-detail/audio-detail.vue' },
      { text: '沙龙、萌宝专区、圈子动态、下单订单与个人中心各自分包，首页、圈子入口、榜单与节假日专场留在主包', 依据: '飞鹰传媒/pages.json' },
    ],
  },
  {
    dir: '西有空间', slug: 'xiyou-space', name: '西有空间', monogram: '西',
    accent: { light: '#0f766e', dark: '#2dd4bf' },
    oneLine: '智慧园区：IoT 设备与自绘键盘',
    points: [
      { text: '自绘车牌键盘：省份键与字母数字键双模切换，含港澳学警临挂专用牌', 依据: '西有空间/components/car-keyboard/car-keyboard.vue' },
      { text: '车牌拆成八格逐位填写，输入框禁用系统键盘，长度进第七、八位时切换键盘模式', 依据: '西有空间/pages/parking-payment/parking-payment.vue' },
      { text: '报修、我要开票、票据记录、智能电表水表与门锁等物业服务集中在 service-center 分包，停车缴费与房间预定留在主包', 依据: '西有空间/pages.json' },
      { text: 'Vuex 存「是否已入住」与用户信息，报修等页面用 mapState 直接消费', 依据: '西有空间/store/index.js' },
      { text: '智能电表页拉近七日用量读数，把当前值与历史值分开渲染', 依据: '西有空间/service-center/smart-meter/smart-meter.vue' },
    ],
  },
  {
    dir: '生鲜积分商城', slug: 'shengxian-mall', name: '生鲜积分商城', monogram: '生',
    accent: { light: '#15803d', dark: '#4ade80' },
    oneLine: '消费币兑换与同城外卖商城',
    points: [
      { text: '同城二级 tabbar 自绘：分包页用不了原生 tabBar，靠 getCurrentPages 算 delta 决定回退还是新推', 依据: '生鲜积分商城/components/same-city-tabbar/same-city-tabbar.vue' },
      { text: '送达时段按「当前时间 + 40 分钟前置量」向上取整到 20 分钟刻度动态生成，过期时段不再出现在列表里', 依据: '生鲜积分商城/components/select-delivery-time/select-delivery-time.vue' },
      { text: '城市列表与当前城市存在 Vuex：顶部导航用 mapState 取 city_list/city_info 喂城市 picker，选中后 commit updateCityInfo 写回并 $emit change 通知所在页', 依据: '生鲜积分商城/components/navbar-top/navbar-top.vue' },
      { text: '自营商城与消费币兑换、同城外卖、充值提现各自成分包根，商品—提交订单—订单详情按业务线各一套', 依据: '生鲜积分商城/pages.json' },
    ],
  },
  {
    dir: '灵猫健康服务', slug: 'lingmao-health', name: '灵猫健康服务', monogram: '灵',
    accent: { light: '#be185d', dark: '#f472b6' },
    oneLine: '站点预约、健康登记与推广收益',
    points: [
      { text: '蓝牙适配器的开启关闭、设备的连接断开全部包成 Promise，初始化报 errCode 10001 时先弹授权框再重跑一次', 依据: '灵猫健康服务/pages/bluetooth-test/bluetoothManager.js' },
      { text: '蓝牙只做成独立的调试页：页面用 uni.$on 接住管理器 $emit 的连接与断开事件同步状态，onUnload 时顺手关掉适配器；该页在 pages.json 里有注册，但全站没有任何跳转入口，主流程走不到它', 依据: '灵猫健康服务/pages/bluetooth-test/bluetooth-test.vue' },
      { text: '竖屏手写签名，再用第二块 canvas 平移旋转 90° 输出横向图，省掉横握手机', 依据: '灵猫健康服务/components/signature/signature.vue' },
      { text: '推广码先在 canvas 2d 上现绘，再由页面把它画进分享海报画布整幅导出', 依据: '灵猫健康服务/promotion-revenue/promotion-code/promotion-code.vue' },
      { text: '推广收益、信息登记（含签字）、服务站点、员工管理各自成分包根', 依据: '灵猫健康服务/pages.json' },
    ],
  },
  {
    dir: '健身', slug: 'zhendongli', name: '臻动力', monogram: '臻',
    accent: { light: '#166534', dark: '#86efac' },
    oneLine: '训练课程、社区与商城合体的健身应用',
    points: [
      { text: 'canvas 逐帧重绘的弹幕带：measureText 量字宽排下一条起点，16ms 推进一帧，整轮划完自动重播并回传 ended 事件', 依据: '健身/components/l-barrage/l-barrage.vue' },
      { text: '分享海报由 canvas 现绘：底图/头像/推广码三张远程图 getImageInfo 计数预载，头像 arc+clip 裁圆，再按 2 倍尺寸导出存相册', 依据: '健身/subPackages2/share-friend/share-friend.vue' },
      { text: '分包按角色分账：subPackages 装代理侧经营台（产品库/在售/订单管理/提现/推广用户），subPackages2 装用户侧成长与内容（等级/金币/勋章/心得/课程播放）', 依据: '健身/pages.json' },
      { text: '日历组件自算周、月两套日期网格，把 train_log 返回的打卡日回填成高亮格，训练记录页再用 ref 取它算好的起止区间拉同一段列表', 依据: '健身/components/k-calendar/k-calendar.vue' },
      { text: '倒计时组件用 computed 取 $store.state.start 并 watch 它；弹幕与跟练视频也从同一路 state 订阅，训练页 dispatch changeStatus 一次，三处 watch 各自 clearInterval 同步停住', 依据: '健身/components/custom-countdown/custom-countdown.vue' },
    ],
  },
  {
    dir: '二手房网签', slug: 'ershoufang-wangqian', name: '二手房网签', monogram: '二',
    accent: { light: '#1d4ed8', dark: '#60a5fa' },
    oneLine: '网签合同流程与双端签署',
    points: [
      { text: '存量房买卖合同分经纪机构版与自行成交版，字段由 required/disabled 标记表驱动渲染', 依据: '二手房网签/pages/ywtb/broker-seller-contract.vue' },
      { text: '金额自动转中文大写（四位分组带万/亿/兆），避免大小写两处不一致', 依据: '二手房网签/utils/amountToChinese.js' },
      { text: '经纪协助、经纪双端与自行成交双端共用一个 WebSocket 封装：30 秒心跳帧、指数退避重连并设最大次数上限', 依据: '二手房网签/utils/ws.js' },
      { text: '买卖双方镜像成对页面，覆盖个人成交、资金监管、预告登记与网签合同四类文书', 依据: '二手房网签/pages.json' },
      { text: '房源二维码由 canvas 2d 前端现绘，内容是 sellHouseID_ 前缀拼房源 id，供买方页 scanCode 绑定', 依据: '二手房网签/pages/ywtb/broker-seller.vue' },
    ],
  },
  {
    dir: '一人一保', slug: 'yiren-yibao', name: '一人一保', monogram: '一',
    accent: { light: '#0e7490', dark: '#22d3ee' },
    oneLine: '档案采集与敲门任务的核验闭环',
    points: [
      { text: '签名后把笔迹按比例旋转贴到远程文书底图上，整幅 canvas 重绘导出', 依据: '一人一保/pages/sign/sign.vue' },
      { text: '合成好的签名图经 storage 一次性交给任务创建页：onShow 读到就调上传并立刻清除，七牛回来的 fileURL 才写进签字字段', 依据: '一人一保/pages/create-task/create-task.vue' },
      { text: '手机号绑定组件带 59 秒倒计时防重发，验证码与 uni.login 的 code 一并提交换微信绑定', 依据: '一人一保/components/verify-phone/verify-phone.vue' },
      { text: '同一个自绘 tabbar 用 tabbarType 在「一人一档 / 敲门行动」两条业务线之间换整套目标路径，created 里逐格 $set 成 index2/task-list2/task-square2/my2，跳转时把业务线名拼进 type 查询参数', 依据: '一人一保/components/custom-tabbar/custom-tabbar.vue' },
      { text: '任务广场只对 memberType 命中领取资格的账号渲染「领取任务」按钮', 依据: '一人一保/pages/task-square/task-square.vue' },
    ],
  },
  {
    dir: '港澳租车原新改', slug: 'gangao-rentcar', name: '港澳租车', monogram: '港',
    accent: { light: '#c2410c', dark: '#fb923c' },
    oneLine: '乘客端与司机端双小程序',
    points: [
      { text: '乘客端与司机端是两套独立工程，各自一份 manifest 与微信小程序 appid', 依据: '港澳租车司机端原新改/manifest.json' },
      { text: '地图选点自绘：map 的 regionchange 拖动即反查地址，再叠一层关键词搜索列表，不只依赖系统选点', 依据: '港澳租车原新改/pages/address/map-address.vue' },
      { text: '年—月—日—时—分五列联动选择器，前一列变动时按需重建后一列的可选范围', 依据: '港澳租车原新改/components/time-picker-wrapper/time-picker-wrapper.vue' },
      { text: '司机端抢单大厅每 10 秒轮询一次可抢订单，onHide 时清掉定时器', 依据: '港澳租车司机端原新改/pages/index/index.vue' },
      { text: '司机端打卡页限最多三张凭证照片：按钮随数量隐藏，提交前拦「最少上传一张」', 依据: '港澳租车司机端原新改/pages/daka-form/daka-form.vue' },
    ],
  },
  {
    dir: '拼豆小程序', slug: 'pindou-mini', name: '拼豆小程序', monogram: '拼',
    accent: { light: '#a21caf', dark: '#e879f9' },
    oneLine: 'canvas 生成拼豆图纸，SSE 推进度',
    points: [
      { text: '小程序没有 EventSource：用 enableChunked + onChunkReceived 手拼 SSE 帧，半截 UTF-8 字节留到下一块再解，result 与 manual 两类事件先 abort 请求再回调', 依据: '拼豆小程序/request/index.js' },
      { text: '进度订阅把 SSE 的 onManual、onError、onEnd 三个回调，加上环境不支持与 35 秒看门狗超时，统统接进同一个降级函数转轮询', 依据: '拼豆小程序/pages/generate/generate.vue' },
      { text: '预览按 dpr 缩放，导出走独立 canvas，位图接近微信单边上限时自动降倍；标尺间距与色号行高随之压缩', 依据: '拼豆小程序/pages/generate/generate_canvas.vue' },
      { text: '拼团页按 is_leader 决定「邀请好友」分享按钮，应邀者只看到加入按钮', 依据: '拼豆小程序/pages/group/group.vue' },
      { text: '拼团记录按 canBuy 决定是否出现「去支付」，下单走预支付接口再调起支付', 依据: '拼豆小程序/pages/groupons/groupons.vue' },
    ],
  },
  {
    dir: '水利地图', slug: 'shuili-map', name: '水利地图', monogram: '水',
    accent: { light: '#3f6212', dark: '#a3e635' },
    oneLine: '地图图层与 live-player 云台监控',
    points: [
      { text: 'live-player 拉 https-flv 直播流，取流失败给遮罩与「重新加载」，业务点多摄像头时出横向切换条', 依据: '水利地图/pages/camera/preview.vue' },
      { text: '云台方向盘按角度旋转渲染，变倍用 touchstart/touchend 做成按住才动，预置位仅在摄像头编号变化时重取', 依据: '水利地图/pages/camera/preview.vue' },
      { text: '地图按图层开关并显示数量与未读角标，markertap/callouttap 联动点位卡，按 _layer_key 换字段与「视频监控」入口', 依据: '水利地图/pages/index/index.vue' },
      { text: '点位详情按字段有无逐个渲染 section，基本情况、家庭情况、应急流程走 mp-html 富文本，安置容量与威胁对象还要 _layer_key 命中对应图层才出现', 依据: '水利地图/pages/point-info/point-info.vue' },
      { text: '卫星电话清单经 storage 一次性交接并立刻清除，点号码直接拨号', 依据: '水利地图/pages/satellite-phone/satellite-phone.vue' },
    ],
  },
];

module.exports = { FEATURED };
