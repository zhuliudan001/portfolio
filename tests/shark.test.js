const test = require('node:test');
const assert = require('node:assert');
const m = require('../scripts/shark-motion.js');

const VIEW = { w: 900, h: 700 };
const run = (frames, seed = 7, pointerAt = null) => {
  const rand = m.mulberry32(seed);
  let s = m.initialState(VIEW, rand);
  const out = [s];
  for (let i = 0; i < frames; i++) {
    s = m.step(s, VIEW, 1 / 60, rand, pointerAt ? pointerAt(s, i) : null);
    out.push(s);
  }
  return out;
};

test('确定性：同一 seed 跑 2000 步逐位相同', () => {
  assert.deepStrictEqual(run(2000, 42), run(2000, 42));
  assert.notDeepStrictEqual(run(200, 1)[199], run(200, 2)[199], '夹具异常：换 seed 结果不变，随机源没接进去');
});

test('不越界，且不靠贴边夹取来过活', () => {
  const frames = run(4000);
  const L = m.bodyLength(VIEW.w);
  const lo = m.marginOf(L), hiX = VIEW.w - lo, hiY = VIEW.h - lo;
  let pinned = 0;
  for (const s of frames) {
    assert.ok(s.x >= lo - 1e-6 && s.x <= hiX + 1e-6 && s.y >= lo - 1e-6 && s.y <= hiY + 1e-6,
      `第 ${frames.indexOf(s)} 帧越界：${s.x.toFixed(1)},${s.y.toFixed(1)}`);
    if (s.x <= lo + 0.5 || s.x >= hiX - 0.5 || s.y <= lo + 0.5 || s.y >= hiY - 0.5) pinned++;
  }
  assert.ok(pinned / frames.length < 0.05,
    `${(100 * pinned / frames.length).toFixed(1)}% 的帧贴在边界上 —— 说明是夹取在兜底而不是转向在工作`);
});

test('视口缩小一半后仍不越界', () => {
  const rand = m.mulberry32(5);
  let s = m.initialState(VIEW, rand);
  const small = { w: 420, h: 380 };
  const lo = m.marginOf(m.bodyLength(small.w));
  for (let i = 0; i < 600; i++) {
    s = m.step(s, small, 1 / 60, rand, null);
    assert.ok(s.x >= lo - 1e-6 && s.x <= small.w - lo + 1e-6, `缩小视口后第 ${i} 帧横向越界 ${s.x.toFixed(1)}`);
    assert.ok(s.y >= lo - 1e-6 && s.y <= small.h - lo + 1e-6, `缩小视口后第 ${i} 帧纵向越界 ${s.y.toFixed(1)}`);
  }
});

/* 位移一致性：位置增量必须由「本帧更新后的朝向与速度」推出，不能沿用上一帧的值。
   (1) 长跑逐帧核验恒等式（跳过被 clampInto 改写过的帧，那一帧的位移本就不该等于 speed×dt）；
   (2) 单帧高动态夹具：本帧大转向 + 速度大涨 + dt 取上限，并显式检查这条恒等式和「沿用上一帧」
       之间差得够远 —— 差得太远才说明断言有分辨力，否则等于白测。 */
test('位移用的是本帧更新后的朝向与速度（不是上一帧的）', () => {
  const DT = 1 / 60;
  const bd = m.bounds(VIEW);
  const clamped = (s) => s.x === bd.lo || s.x === bd.hiX || s.y === bd.lo || s.y === bd.hiY;
  const frames = run(1200);
  let checked = 0;
  for (let i = 1; i < frames.length; i++) {
    const p = frames[i - 1], s = frames[i];
    if (clamped(p) || clamped(s)) continue;
    checked++;
    assert.ok(Math.abs((s.x - p.x) - Math.cos(s.heading) * s.speed * DT) < 1e-9,
      `第 ${i} 帧横向位移没按本帧朝向×速度走：实测 ${(s.x - p.x).toFixed(6)}，应为 ${(Math.cos(s.heading) * s.speed * DT).toFixed(6)}`);
    assert.ok(Math.abs((s.y - p.y) - Math.sin(s.heading) * s.speed * DT) < 1e-9,
      `第 ${i} 帧纵向位移没按本帧朝向×速度走：实测 ${(s.y - p.y).toFixed(6)}，应为 ${(Math.sin(s.heading) * s.speed * DT).toFixed(6)}`);
  }
  assert.ok(checked > 1000, `夹具异常：1200 帧里只核验了 ${checked} 帧，这条断言基本没跑`);

  const L = m.bodyLength(VIEW.w);
  const R = m.avoidRadius(L);
  const v0 = m.baseSpeed(L);
  const cap = m.CONST.DT_CAP;
  const P = { x: 450, y: 300 + R * 0.4 };
  const p = { x: 450, y: 300, heading: Math.PI / 2, speed: v0, tailPhase: 0,
    turnBias: 0, turnTimer: 1e9, cruise: v0, startle: 0, pulse: 1 };
  const s = m.step(p, VIEW, cap, m.mulberry32(1), P);
  const fresh = { x: Math.cos(s.heading) * s.speed * cap, y: Math.sin(s.heading) * s.speed * cap };
  const stale = { x: Math.cos(p.heading) * p.speed * cap, y: Math.sin(p.heading) * p.speed * cap };
  assert.ok(Math.abs(fresh.x - stale.x) + Math.abs(fresh.y - stale.y) > 0.1,
    '夹具退化：本帧与上一帧的朝向/速度差得太小，这条断言分不出对错');
  assert.ok(Math.abs((s.x - p.x) - fresh.x) < 1e-9 && Math.abs((s.y - p.y) - fresh.y) < 1e-9,
    `高动态帧的位移沿用了上一帧的朝向/速度：实测 ${(s.x - p.x).toFixed(6)},${(s.y - p.y).toFixed(6)}，`
      + `应为 ${fresh.x.toFixed(6)},${fresh.y.toFixed(6)}（沿用上一帧会是 ${stale.x.toFixed(6)},${stale.y.toFixed(6)}）`);
  assert.ok(Math.abs(Math.hypot(s.x - p.x, s.y - p.y) - s.speed * cap) < 1e-9,
    '位移大小不等于本帧速度×dt —— 出现横着平移或倒退');
});

/* 巡游必须「转完就直游」。规格 §4 第 2 条说「隔几秒才换一次意图」是巡游而非抖动的关键，
   但意图若写成「朝 heading + turnBias 转」就成了跟随式目标：want 恒等于 turnBias，
   want/dt ≈ 36 rad/s 每帧都顶到 TURN_MAX，于是它永远在满舵画圆
   （实测满舵帧 100.00%、转弯半径恒为身长的 0.75 倍，4× 放大下轨迹是一串闭合正圆）。
   这里钉三件事：① 满舵不占多数帧；② 有足够长的直游段；③ 一次意图转过的总角不超过额度。
   视口取 20000×20000 并把出生点钉在正中，让边界前瞻与指针回避在 60 秒内都不介入，
   隔离出巡游本身。 */
test('巡游意图转完就收敛：不持续满舵、有直游段、单次意图转角不超 WANDER_RANGE', () => {
  const DT = 1 / 60;
  const big = { w: 20000, h: 20000 };
  const cap = m.CONST.TURN_MAX * DT * 0.9;
  const rand = m.mulberry32(7);
  let s = Object.assign(m.initialState(big, rand), { x: 10000, y: 10000 });
  let sat = 0, frames = 0, run = 0, bestRun = 0;
  let intentTurn = 0, worstIntentTurn = 0, holds = 0;
  for (let i = 0; i < 3600; i++) {
    const before = s.heading;
    const timerBefore = s.turnTimer;
    s = m.step(s, big, DT, rand, null);
    const d = Math.abs(m.angleDelta(s.heading, before));
    if (s.turnTimer > timerBefore) {   // turnTimer 被重掷 → 上一次意图结束
      holds++;
      if (intentTurn > worstIntentTurn) worstIntentTurn = intentTurn;
      intentTurn = 0;
    }
    if (d > cap) { sat++; run = 0; } else { run++; if (run > bestRun) bestRun = run; }
    intentTurn += d;
    frames++;
  }
  const pct = sat / frames;
  assert.ok(pct > 0.02, `满舵帧只有 ${(pct * 100).toFixed(1)}%，它几乎不转向 —— 夹具退化成直线，这条测不出东西`);
  assert.ok(pct < 0.5,
    `满舵帧占 ${(pct * 100).toFixed(1)}%：它每帧都在顶格转，游的是圆圈不是巡游`);
  assert.ok(bestRun >= 60, `最长的直游段只有 ${bestRun} 帧（1 秒 = 60 帧），转完额度没有直游`);
  assert.ok(holds >= 10, `60 秒里只重掷了 ${holds} 次意图，TURN_HOLD 夹具没跑到`);
  assert.ok(worstIntentTurn <= m.CONST.WANDER_RANGE + 0.02,
    `单次意图最多转了 ${worstIntentTurn.toFixed(2)} rad，超过 WANDER_RANGE=${m.CONST.WANDER_RANGE}`
      + `（跟随式目标会把它放大成 ${m.CONST.TURN_MAX}×TURN_HOLD_MIN 起步的整圈）`);
});

/* 上面那条巡游收敛测试用的是 20000×20000 的水池，向心覆盖在里面**永不触发**，
   所以「被接管的帧要不要消耗额度」三种语义（保留 / 无条件消耗 / 接管即作废）在那里逐位相同 ——
   本轮复核实测过：改成「接管即作废」重建产物后 105/105 全绿。这里专门钉这一行。
   夹具用真实视口 900×700，把鲨鱼摆成贴着右墙且朝墙外（roomX = 1 < band）→ 向心必然接管；
   turnTimer = 1e9 让随机重掷分支一帧都不触发（与脉冲测试同一手法）。 */
test('残留转向额度：向心接管的帧不消耗，巡游帧才消耗', () => {
  const DT = 1 / 60;
  const v = { w: 900, h: 700 };
  const b = m.bounds(v);
  const L = m.bodyLength(v.w);
  const v0 = m.baseSpeed(L);
  const BIAS = 0.5;
  const nearWall = { x: b.hiX - 1, y: (b.lo + b.hiY) / 2, heading: 0, speed: v0, tailPhase: 0,
    turnBias: BIAS, turnTimer: 1e9, cruise: v0, startle: 0, pulse: 0 };
  const mid = Object.assign({}, nearWall, { x: (b.lo + b.hiX) / 2 });
  const rand = () => 0.5;

  const taken = m.step(nearWall, v, DT, rand, null);
  assert.notStrictEqual(taken.heading, nearWall.heading,
    '夹具退化：贴墙朝外这一帧没被向心接管（朝向没动），这条测不到接管语义');
  assert.strictEqual(taken.turnBias, BIAS,
    `被向心接管的一帧动了额度（${BIAS}→${taken.turnBias}）：本应原样保留，等扰动结束后再补完这次转向`);

  const cruising = m.step(mid, v, DT, rand, null);
  assert.ok(Math.abs(cruising.heading - mid.heading) > 1e-9,
    '夹具退化：开阔水域这一帧没转向，额度消耗无从观察');
  assert.ok(cruising.turnBias < BIAS && cruising.turnBias > 0,
    `巡游帧没按本帧角速度扣额度：${BIAS}→${cruising.turnBias}`);
  assert.ok(Math.abs(cruising.turnBias - (BIAS - m.CONST.TURN_MAX * DT)) < 1e-12,
    `扣减量不是 TURN_MAX×dt：实际 ${cruising.turnBias}，期望 ${BIAS - m.CONST.TURN_MAX * DT}`);

  let s = mid;
  for (let i = 0; i < 60; i++) s = m.step(s, v, DT, rand, null);
  assert.ok(Math.abs(s.turnBias) < 1e-12, `60 帧（1 秒）后额度仍未归零：${s.turnBias}`);
});

/* 终审 F-1/F-2：这三处原本「改了也全绿」。注意验证时必须先 `node scripts/build.js` 再跑 ——
   不重建的话构建新鲜度锁（内联脚本与源码同源）会先红，把「行为锁有没有覆盖」整个盖住。 */
test('朝左时水平镜像、朝右时不镜像（肚皮永远朝下，不会上下颠倒着倒游）', () => {
  const flips = (heading) => {
    const ctx = stubCtx();
    m.render(ctx, { x: 400, y: 300, heading, speed: 50, tailPhase: 0.7,
      turnBias: 0, turnTimer: 1, cruise: 50, startle: 0, pulse: 0 },
    { w: VIEW.w, h: VIEW.h, dpr: 1, dark: false });
    return ctx.log.scales.filter((s) => s[0] === 1 && s[1] === -1).length;
  };
  assert.strictEqual(flips(0), 0, '朝右（cos>0）却做了垂直翻转，肚皮会朝上');
  assert.strictEqual(flips(Math.PI), 1, '朝左（cos<0）没做垂直翻转 —— 删掉那句镜像，产物照样画得出来，鲨鱼却上下颠倒');
  assert.strictEqual(flips(Math.PI / 2), 0, '正朝上游（cos≈0）不该翻转');
  assert.strictEqual(flips(-Math.PI / 2), 0, '正朝下游（cos≈0）不该翻转');
});

test('贴边前瞻按转弯半径提前起转，不是撞到边界才转', () => {
  const v = { w: 360, h: 740 };
  const b = m.bounds(v);
  const R = m.avoidRadius(m.bodyLength(v.w));
  const speed = 72;
  const ahead = 2 * (speed / m.CONST.TURN_MAX);
  assert.ok(ahead > R, `夹具退化：这个速度下 2×转弯半径 ${ahead.toFixed(1)} 不大于 avoidRadius ${R.toFixed(1)}，band 取的是后者，测不出前瞻`);
  const room = (R + ahead) / 2;
  /* turnBias=0 且 turnTimer=1e9：随机重掷与巡游转向都不参与，朝向若变了，只能来自向心前瞻 */
  const s0 = { x: b.hiX - room, y: (b.lo + b.hiY) / 2, heading: 0, speed, tailPhase: 0,
    turnBias: 0, turnTimer: 1e9, cruise: speed, startle: 0, pulse: 0 };
  const s1 = m.step(s0, v, 1 / 60, () => 0.5, null);
  assert.ok(Math.abs(m.angleDelta(s1.heading, 0)) > 1e-9,
    `法向余量 ${room.toFixed(1)}px（大于 avoidRadius ${R.toFixed(1)}、小于 2×转弯半径 ${ahead.toFixed(1)}）时没提前起转`
      + ' —— 前瞻下界退回了 avoidRadius，它会一路压到边界才掉头，沿墙滑行就是这么来的');
});

test('出生朝向对着视心，不会一落地就朝墙游', () => {
  const v = { w: 500, h: 700 };
  const b = m.bounds(v);
  const cx = (b.lo + b.hiX) / 2;
  const cy = (b.lo + b.hiY) / 2;
  const floor = Math.cos(m.CONST.WANDER_RANGE / 2) - 1e-9;
  let worst = Infinity;
  for (let i = 0; i < 300; i++) {
    const s = m.initialState(v, m.mulberry32(i * 7919 + 13));
    const norm = Math.hypot(cx - s.x, cy - s.y) || 1;
    worst = Math.min(worst, (Math.cos(s.heading) * (cx - s.x) + Math.sin(s.heading) * (cy - s.y)) / norm);
  }
  assert.ok(worst >= floor,
    `300 个 seed 里最差的出生朝向对「指向视心」的夹角余弦只有 ${worst.toFixed(3)}，低于 cos(WANDER_RANGE/2)=${floor.toFixed(3)}`
      + ' —— 有 seed 一落地就朝墙游，落地第一件事就是贴着边界滑行掉头');
});

/* 怕人：把鲨鱼摆成「正对着指针」，隔离出逃离转向本身。
   旧判据「30 帧内至少挪开 20px」量的是巡航位移（同一夹具不放指针，60 个 seed 的最近距离也有
   26.2px、平均 36.8px），删掉逃离转向仍然全绿，等于没测。
   现判据看的是「会不会逼近指针」：鲨鱼开局正对指针、半个惊扰半径远，没有逃离转向时它会一路穿过
   指针（最近距离 ≈ 0），有逃离转向时它绕行，最近距离始终留在初始距离的一半以上。
   夹具是手工构造的，turnTimer = 1e9 → step 里的随机重掷分支一帧都不触发、rand 一次也不消耗，
   所以结果与 seed 无关。 */
test('怕人：正对指针冲来时转向逃离，绝不逼近到初始距离的一半以内', () => {
  const L = m.bodyLength(VIEW.w);
  const R = m.avoidRadius(L);
  const v0 = m.baseSpeed(L);
  const P = { x: 450 + R * 0.5, y: 350 };
  let s = { x: 450, y: 350, heading: 0, speed: v0, tailPhase: 0,
    turnBias: 0, turnTimer: 1e9, cruise: v0, startle: 0, pulse: 0 };
  const d0 = Math.hypot(P.x - s.x, P.y - s.y);
  assert.ok(d0 < R, `夹具异常：指针应落在惊扰半径 ${R.toFixed(1)}px 内，实际 ${d0.toFixed(1)}px`);
  const rand = m.mulberry32(1);
  let closest = d0;
  for (let i = 0; i < 60; i++) {
    s = m.step(s, VIEW, 1 / 60, rand, P);
    closest = Math.min(closest, Math.hypot(P.x - s.x, P.y - s.y));
  }
  const dEnd = Math.hypot(P.x - s.x, P.y - s.y);
  assert.ok(closest > d0 * 0.5,
    `60 帧里最近只留到 ${closest.toFixed(1)}px（初始 ${d0.toFixed(1)}px）—— 它穿过了指针，逃离转向没起作用`);
  assert.ok(dEnd > d0, `60 帧后离指针 ${dEnd.toFixed(1)}px，没比初始 ${d0.toFixed(1)}px 更远，不在远离`);
  assert.ok(Math.cos(s.heading) < 0,
    `指针在正前方时朝向应已转到背对指针的一侧，实际 heading=${s.heading.toFixed(3)}rad`);
});

/* 脉冲机制：同一份手工夹具跑两条轨迹，一条 pulse() 置位一条不置位，逐帧对照。
   夹具里 turnTimer = 1e9 → step 的随机重掷分支永不触发，cruise 恒等于 baseSpeed，
   于是未脉冲那条的速度逐帧恒为 v0：任何断言都不再依赖 rand() 抽到哪个巡航值
   （旧判据 `speed < peak * 1.2` 量的就是这个随机值，60 个 seed 里 29 个会翻车）。
   显式声明：initialState/step 里 rand() 的调用次数与顺序对这些夹具是承重的 ——
   重排任何一次调用都会让既有 seed 的轨迹整体漂移，改实现时必须连这些断言一起复核。 */
test('脉冲会衰减：置位期间速度严格更高，PULSE_SECONDS 后归零并与未脉冲轨迹收敛', () => {
  const L = m.bodyLength(VIEW.w);
  const v0 = m.baseSpeed(L);
  const DT = 1 / 60;
  const window = Math.ceil(m.CONST.PULSE_SECONDS / DT);
  const s0 = { x: 450, y: 350, heading: 0, speed: v0, tailPhase: 0,
    turnBias: 0, turnTimer: 1e9, cruise: v0, startle: 0, pulse: 0 };
  let a = m.pulse(s0);
  let b = Object.assign({}, s0);
  assert.strictEqual(a.pulse, 1, 'pulse() 没把脉冲置成 1');

  const ra = m.mulberry32(3), rb = m.mulberry32(3);
  const gaps = [];
  let peak = v0, zeroAt = -1;
  for (let i = 1; i <= window * 4; i++) {
    a = m.step(a, VIEW, DT, ra, null);
    b = m.step(b, VIEW, DT, rb, null);
    assert.strictEqual(b.speed, v0, `第 ${i} 帧未脉冲轨迹的速度不再是 v0，夹具开始依赖随机巡航值`);
    if (a.pulse > 0) assert.ok(a.speed > b.speed, `第 ${i} 帧脉冲还没衰减完却没有提速`);
    if (a.pulse === 0 && zeroAt < 0) zeroAt = i;
    peak = Math.max(peak, a.speed);
    gaps.push(a.speed - b.speed);
  }
  assert.ok(zeroAt > 0 && Math.abs(zeroAt - window) <= 1,
    `脉冲在第 ${zeroAt} 帧才归零，PULSE_SECONDS=${m.CONST.PULSE_SECONDS}s（${window} 帧）没对上`);
  for (let i = zeroAt; i < gaps.length; i++) {
    assert.ok(gaps[i] <= gaps[i - 1] + 1e-12,
      `第 ${i + 1} 帧脉冲已归零，速度差却在重新变大（${gaps[i - 1].toFixed(3)}→${gaps[i].toFixed(3)}）`);
  }
  assert.ok(peak > v0 * 1.2, `脉冲期间峰值只有 ${peak.toFixed(1)}（巡航 ${v0.toFixed(1)}），速度没冲高`);
  assert.ok(peak <= v0 * m.CONST.PULSE_SPEED + 1e-9,
    `峰值 ${peak.toFixed(1)} 超过增益上限 ${(v0 * m.CONST.PULSE_SPEED).toFixed(1)}`);
  assert.strictEqual(a.speed, v0, `脉冲结束后速度没收敛回 v0，实际 ${a.speed}`);
  assert.strictEqual(a.speed, b.speed, '脉冲轨迹与未脉冲轨迹没收敛到同一速度');
  assert.ok(a.x > b.x, '整段脉冲下来位移没多走一步，提速是假的');
});

/* ---- 绘制与配色 ---- */
const fs = require('node:fs');
const path = require('node:path');
const { contrast } = require('../scripts/util.js');

function stubCtx() {
  /* paints 每条记 [操作, 当时生效的色, 当时生效的线宽, 当时的裁剪深度]。
     只记色不够：删掉 ctx.lineWidth 赋值或删掉 ctx.clip() 都是「产物照样画出来、测试照样绿」的
     同类漏洞（Task 4 评审逼出「记录上色」时只做了一半，本轮复核把另一半补上）。
     裁剪必须记**深度**而不是累计次数：真实 canvas 的 clip 会被 restore() 弹出，
     按累计算的话肚皮之后的每个 fill 都被误判成「裁在里里面」。 */
  const log = { save: 0, restore: 0, path: 0, paint: 0, depth: 0, scales: [], paints: [] };
  const stack = [];
  return {
    log,
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineJoin: '', lineCap: '',
    save() { log.save++; stack.push(log.depth); },
    restore() { log.restore++; log.depth = stack.pop() || 0; },
    beginPath: () => { log.path++; }, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    quadraticCurveTo: () => {}, bezierCurveTo: () => {}, arc: () => {}, ellipse: () => {},
    clip() { log.depth++; },
    fill() { log.paint++; log.paints.push(['fill', this.fillStyle, this.lineWidth, log.depth]); },
    stroke() { log.paint++; log.paints.push(['stroke', this.strokeStyle, this.lineWidth, log.depth]); },
    setTransform: () => {}, clearRect: () => {}, translate: () => {}, rotate: () => {},
    scale(a, b) { log.scales.push([a, b]); },
  };
}

/* Task 2  palette 回归锁：每一次上屏的填充/描边都必须是 PALETTE 里的色 ——
   fill 只允许 fill/belly/eye/ink，stroke 在现设计里恒为 line。
   画布默认黑 #000 对浅色页对比 21.0，会打穿三层对比设计；fill/stroke 互换同样被抓。 */
test('绘制只用调色板色：任何 fill/stroke 都不得用画布默认黑，也不得填充/描边换色', () => {
  const rand = m.mulberry32(11);
  const s = m.initialState(VIEW, rand);
  const fillOk = (c) => new Set([c.fill, c.belly, c.eye, c.ink]);
  for (const dark of [false, true]) {
    const tag = dark ? '深色' : '浅色';
    const c = m.PALETTE[dark ? 'dark' : 'light'];
    const ctx = stubCtx();
    // 夹具自查：默认值必须是真实 canvas 的初始值，否则这条锁形同虚设
    assert.strictEqual(ctx.fillStyle, '#000000');
    assert.strictEqual(ctx.strokeStyle, '#000000');
    assert.strictEqual(ctx.lineWidth, 1);
    m.render(ctx, s, { w: VIEW.w, h: VIEW.h, dpr: 2, dark });
    assert.ok(ctx.log.paints.length >= 8, `${tag}：只记录了 ${ctx.log.paints.length} 次上屏绘制，夹具没覆盖整只鲨鱼`);
    for (const [op, color] of ctx.log.paints) {
      assert.notStrictEqual(color, '#000000',
        `${tag}：${op} 用了画布默认黑 #000000 —— 有人删了设色语句（Task 2 简报原文的 drawTail 就是这么把尾巴涂黑的）`);
      if (op === 'fill') {
        assert.ok(fillOk(c).has(color), `${tag}：fill 用了不属于填充系的色 ${color}`);
      } else {
        assert.strictEqual(color, c.line, `${tag}：stroke 色 ${color} 不是 line ${c.line}（填充/描边互换？）`);
      }
    }
  }
});

test('绘制几何卫生：肚皮必须裁在身体内、描边只有身体与鳃裂两种线宽', () => {
  const rand = m.mulberry32(5);
  const s = m.initialState(VIEW, rand);
  for (const dark of [false, true]) {
    const tag = dark ? '深色' : '浅色';
    const c = m.PALETTE[dark ? 'dark' : 'light'];
    const ctx = stubCtx();
    m.render(ctx, s, { w: VIEW.w, h: VIEW.h, dpr: 2, dark });

    /* 肚皮椭圆比身体宽，靠 clip 才不溢出。删掉那句 clip 产物照样画出来（而且更「满」），
       所以必须钉「有且只有一次 fill 发生在 clip 生效期间，且它就是肚皮」。
       不能按色值找：深色板的 belly 与 eye 同为 #1a1a1a，牙和高光会一起数进来。
       实测现版肚皮约七成四的面积依赖 clip。 */
    const clipped = ctx.log.paints.filter((p) => p[0] === 'fill' && p[3] >= 1);
    assert.strictEqual(clipped.length, 1, `${tag}：裁剪中的 fill 不是恰好一次（${clipped.length} 次）`);
    assert.strictEqual(clipped[0][1], c.belly, `${tag}：被裁剪的那次 fill 不是肚皮色，而是 ${clipped[0][1]}`);

    /* 描边只有两种线宽：身体/鳍的轮廓，和鳃裂的细线。
       删掉任一赋值都会退化成画布默认的 1（在 4× 放大下肉眼可见，测试却毫无感知）。 */
    const widths = [...new Set(ctx.log.paints.filter((p) => p[0] === 'stroke').map((p) => p[2]))].sort((a, b) => a - b);
    assert.deepStrictEqual(widths, [2.4, 3],
      `${tag}：描边线宽集合是 [${widths}]，应为 [2.4, 3]（鳃裂细线 + 身体轮廓；少一个说明有人删了赋值）`);
  }
});

test('配色三层：描边看得见、正文压得住、细节分得开', () => {
  for (const key of ['light', 'dark']) {
    const c = m.PALETTE[key];
    const edge = contrast(c.line, c.page);
    /* 上界从 1.9 放宽到 2.4：形状改版后剪影全靠描边（56–96px 的实物尺寸下，
       1.7 档的轮廓在浅色板上几乎看不见）。放宽的代价是「轮廓会不会跟正文抢层级」，
       而这条**没有**断言在管 —— 曾加过一条 text/line ≥ 7，实测算出它在浅色板被本行
       上界蕴含（2.4 处该比值 7.87），是条咬不到人的假锁，已撤。这里只留下界本身。 */
    assert.ok(edge >= 1.5 && edge <= 2.4, `${key} 描边 vs 底色 ${edge.toFixed(2)} 不在 1.5–2.4 带内`);
    const fill = contrast(c.fill, c.page);
    assert.ok(fill <= 1.9, `${key} 填充 vs 底色 ${fill.toFixed(2)} 超过 1.9，会跟正文抢`);
    /* 注意这条的管辖轴：固定 text 时它被上面的 fill ≤ 1.9 蕴含（穷举 68/66 个合法灰阶，
       比值最小 9.94 / 8.64，永不先违反）。它真正拦的是 text 漂移 —— text 亮过 #444（浅）
       或暗过 #b8b8（深）时它会咬。别把它当 fill 的第二道闸。 */
    const over = contrast(c.text, c.fill);
    assert.ok(over >= 7, `${key} 正文压在填充上只有 ${over.toFixed(2)}，鲨鱼游到段落底下会糊字`);
    for (const d of ['belly', 'eye', 'ink']) {
      const detail = contrast(c[d], c.fill);
      assert.ok(detail >= 1.2, `${key} 内部细节 ${d} vs 填充 ${detail.toFixed(2)} < 1.2，层次化了`);
    }
  }
});

test('render 一帧：save/restore 平衡且有实际绘制动作', () => {
  const rand = m.mulberry32(9);
  const s = m.initialState(VIEW, rand);
  for (const dark of [false, true]) {
    const ctx = stubCtx();
    m.render(ctx, s, { w: VIEW.w, h: VIEW.h, dpr: 2, dark });
    assert.strictEqual(ctx.log.save, ctx.log.restore,
      `深色=${dark}：save ${ctx.log.save} / restore ${ctx.log.restore} 不平衡，变换会逐帧泄漏`);
    assert.ok(ctx.log.save >= 3, `只 save 了 ${ctx.log.save} 次，不像画了一只鲨鱼`);
    assert.ok(ctx.log.path >= 4 && ctx.log.paint >= 4, `path=${ctx.log.path} paint=${ctx.log.paint}，绘制调用太少`);
  }
});

test('摆尾角在 ±TAIL_SWING 内周期变化', () => {
  const rand = m.mulberry32(13);
  let s = m.initialState(VIEW, rand);
  const seen = new Set();
  let max = 0;
  for (let i = 0; i < 400; i++) {
    s = m.step(s, VIEW, 1 / 60, rand, null);
    const a = m.tailAngle(s);
    max = Math.max(max, Math.abs(a));
    seen.add(a > 0 ? 1 : -1);
  }
  assert.ok(seen.size === 2, '尾鳍没来回摆，只朝一个方向');
  assert.ok(max <= m.CONST.TAIL_SWING + 1e-9, `摆幅 ${max.toFixed(3)} 超出 TAIL_SWING`);
  assert.ok(max > m.CONST.TAIL_SWING * 0.6, '几乎没摆，TAIL_SWING 没起作用');
});

test('可内联性：源码无外部依赖、module.exports 只有一处、剥完能解析', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'shark-motion.js'), 'utf8');
  assert.ok(!/require\s*\(/.test(src), 'shark-motion.js 引入了依赖，内联进浏览器就是坏代码');
  assert.strictEqual((src.match(/module\.exports\s*=/g) || []).length, 1, 'module.exports 不止一处');
  const body = src.slice(0, src.lastIndexOf('module.exports'));
  assert.doesNotThrow(() => new Function(body), '剥掉导出后剩下的源码不是合法脚本');
});
