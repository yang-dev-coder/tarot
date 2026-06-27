/**
 * gesture.js — Part 2 完整实现
 *
 * 涵盖：
 *   Phase 6.2  startSway / stopSway        — 摇摆动画
 *   Phase 6.3  initParticleCanvas / tick   — 金色粒子游走
 *   Phase 6.4  updateGestureHint          — 手势提示文字
 *   Phase 7.1  initMediaPipe              — MediaPipe Hands 初始化
 *   Phase 7.2  isPointingGesture          — 食指伸直判断
 *   Phase 7.3  onHandResults              — 碰撞检测 + 3帧防抖
 *   Phase 7.4  updateCharge              — 蓄力逻辑
 *   Phase 7.5  updateChargeUI            — 蓄力环 SVG
 *   Phase 7.6  burstParticles            — 选中火花爆开
 *   Phase 7.7  flyToCollectArea          — 牌飞入收集区
 *   Phase 7.8  鼠标降级：hover蓄力 + click即选
 */

// ═══════════════════════════════════════════════════════════════════
// Phase 6.2 — 摇摆动画
// ═══════════════════════════════════════════════════════════════════

let swayAngle = 0;
let swayRAF   = null;

function startSway() {
  if (swayRAF) return;          // 防止多次启动

  function tick() {
    swayAngle += 0.008;
    const cardEls = document.querySelectorAll('#card-tray .tarot-card');
    cardEls.forEach((el, i) => {
      if (el.classList.contains('selected')) return;
      if (STATE.hoveredCard === el)          return; // 蓄力中暂停摇摆

      const swayOffset = Math.sin(swayAngle + i * 0.35) * 2.8;
      const base       = el.dataset.baseTransform || '';
      el.style.transform = base + ` rotate(${swayOffset}deg)`;
    });
    swayRAF = requestAnimationFrame(tick);
  }
  swayRAF = requestAnimationFrame(tick);
}

function stopSway() {
  if (swayRAF) { cancelAnimationFrame(swayRAF); swayRAF = null; }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 6.3 — 金色粒子游走 + 爆开粒子（共用 canvas）
// ═══════════════════════════════════════════════════════════════════

const AMBIENT_COUNT  = 38;
let   particleCanvas = null;
let   particleCtx    = null;
let   particleRAF    = null;
let   ambientParticles = [];
let   burstParticleList = [];
let   attractTarget    = null;  // {x, y} 选中牌时粒子短暂吸引

/** 初始化粒子 canvas，叠在 card-tray 上方 */
function initParticleCanvas() {
  const tray = document.getElementById('card-tray');
  if (!tray) return;

  // 避免重复创建
  let existing = document.getElementById('particle-canvas');
  if (existing) existing.remove();

  particleCanvas = document.createElement('canvas');
  particleCanvas.id = 'particle-canvas';
  Object.assign(particleCanvas.style, {
    position:       'absolute',
    inset:          '0',
    width:          '100%',
    height:         '100%',
    zIndex:         '300',
    pointerEvents:  'none',
  });
  tray.appendChild(particleCanvas);
  particleCtx = particleCanvas.getContext('2d');

  _resizeCanvas();
  window.addEventListener('resize', _resizeCanvas);

  _spawnAmbient();
  _particleTick();
}

function _resizeCanvas() {
  if (!particleCanvas) return;
  const tray = document.getElementById('card-tray');
  if (!tray) return;
  particleCanvas.width  = tray.offsetWidth  || 760;
  particleCanvas.height = tray.offsetHeight || 450;
}

function _spawnAmbient() {
  ambientParticles = [];
  const W = particleCanvas.width  || 760;
  const H = particleCanvas.height || 450;
  for (let i = 0; i < AMBIENT_COUNT; i++) {
    ambientParticles.push({
      x:     Math.random() * W,
      y:     Math.random() * H,
      vx:    (Math.random() - 0.5) * 0.55,
      vy:    (Math.random() - 0.5) * 0.55,
      r:     0.8 + Math.random() * 1.4,
      alpha: 0.18 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function _particleTick() {
  if (!particleCtx) return;
  particleRAF = requestAnimationFrame(_particleTick);

  const W = particleCanvas.width;
  const H = particleCanvas.height;
  particleCtx.clearRect(0, 0, W, H);

  // ── 游走粒子 ──────────────────────────────────────────────────
  ambientParticles.forEach(p => {
    p.phase += 0.025;
    const glow = Math.sin(p.phase) * 0.12;

    if (attractTarget) {
      // 短暂向选中牌聚拢
      const dx = attractTarget.x - p.x;
      const dy = attractTarget.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      p.vx += (dx / dist) * 0.08;
      p.vy += (dy / dist) * 0.08;
      // 速度上限
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 3.5) { p.vx *= 3.5 / speed; p.vy *= 3.5 / speed; }
    }

    p.x += p.vx;
    p.y += p.vy;

    // 边缘反弹 + 小摩擦
    if (p.x < 0 || p.x > W) { p.vx *= -0.92; p.x = Math.max(0, Math.min(W, p.x)); }
    if (p.y < 0 || p.y > H) { p.vy *= -0.92; p.y = Math.max(0, Math.min(H, p.y)); }

    particleCtx.beginPath();
    particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    particleCtx.fillStyle = `rgba(201,169,110,${Math.min(1, p.alpha + glow)})`;
    particleCtx.fill();
  });

  // 吸引过后复位速度
  if (attractTarget) {
    ambientParticles.forEach(p => {
      p.vx *= 0.97; p.vy *= 0.97;
    });
  }

  // ── 爆开粒子 ──────────────────────────────────────────────────
  burstParticleList = burstParticleList.filter(p => p.age < p.life);
  burstParticleList.forEach(p => {
    p.age += 0.035;
    p.x   += p.vx;
    p.y   += p.vy;
    p.vx  *= 0.93;
    p.vy  *= 0.93;
    const t = 1 - p.age / p.life;
    particleCtx.beginPath();
    particleCtx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
    particleCtx.fillStyle = `rgba(201,169,110,${t * 0.9})`;
    particleCtx.fill();

    // 小尾迹点
    particleCtx.beginPath();
    particleCtx.arc(p.x - p.vx * 2, p.y - p.vy * 2, p.size * t * 0.4, 0, Math.PI * 2);
    particleCtx.fillStyle = `rgba(255,230,160,${t * 0.4})`;
    particleCtx.fill();
  });
}

/** 在指定 canvas 坐标处爆开粒子（选中瞬间调用） */
function burstParticles(canvasX, canvasY, count = 28) {
  // 短暂吸引 → 再爆开
  attractTarget = { x: canvasX, y: canvasY };
  setTimeout(() => { attractTarget = null; }, 600);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.2 + Math.random() * 4.5;
    burstParticleList.push({
      x:     canvasX,
      y:     canvasY,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      size:  2.5 + Math.random() * 2.5,
      life:  0.9,
      age:   0,
    });
  }
}

/** 根据 cardEl 的屏幕位置换算到 canvas 坐标 */
function _cardToCanvasXY(cardEl) {
  if (!particleCanvas) return { x: 0, y: 0 };
  const cr = cardEl.getBoundingClientRect();
  const pr = particleCanvas.getBoundingClientRect();
  return {
    x: (cr.left + cr.width  / 2) - pr.left,
    y: (cr.top  + cr.height / 2) - pr.top,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Phase 6.4 — 手势提示文字
// ═══════════════════════════════════════════════════════════════════

function updateGestureHint() {
  const el = document.getElementById('gesture-hint');
  if (!el) return;
  if (STATE.gestureEnabled) {
    el.textContent = '☝️ 伸出食指悬停牌面，蓄力后自动选中';
  } else {
    el.textContent = '点击牌面选牌，或直接点击立即确认';
  }
  el.style.opacity = '0';
  setTimeout(() => { el.style.opacity = '1'; }, 50);
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7.1 — MediaPipe Hands 初始化
// ═══════════════════════════════════════════════════════════════════

let mpHands  = null;
let mpCamera = null;

async function initMediaPipe() {
  if (!STATE.gestureEnabled) return;
  if (typeof Hands === 'undefined') {
    console.warn('[gesture] MediaPipe Hands 未加载，降级为鼠标模式');
    STATE.gestureEnabled = false;
    updateGestureHint();
    return;
  }

  try {
    mpHands = new Hands({
      locateFile: file =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
    });
    mpHands.setOptions({
      maxNumHands:              1,
      modelComplexity:          1,
      minDetectionConfidence:   0.7,
      minTrackingConfidence:    0.5,
    });
    mpHands.onResults(onHandResults);

    const videoEl = document.getElementById('camera-feed');
    mpCamera = new Camera(videoEl, {
      onFrame: async () => { await mpHands.send({ image: videoEl }); },
      width:  640,
      height: 480,
    });
    mpCamera.start();
    updateGestureHint();
    console.log('[gesture] MediaPipe 初始化成功');
  } catch (e) {
    console.warn('[gesture] MediaPipe 初始化失败，降级鼠标模式', e);
    STATE.gestureEnabled = false;
    updateGestureHint();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7.2 — 手势判断
// ═══════════════════════════════════════════════════════════════════

function isPointingGesture(landmarks) {
  return (
    landmarks[8].y  < landmarks[6].y  &&   // 食指伸直
    landmarks[12].y > landmarks[10].y &&   // 中指弯曲
    landmarks[16].y > landmarks[14].y &&   // 无名指弯曲
    landmarks[20].y > landmarks[18].y      // 小指弯曲
  );
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7.3 — onHandResults（碰撞检测 + 3帧防抖）
// ═══════════════════════════════════════════════════════════════════

let stableCount  = 0;
let lastHitIdx   = null;

function onHandResults(results) {
  if (STATE.phase !== 'selecting') return;
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    // 手离开 → 不重置蓄力，只清除 hover 状态
    STATE.hoveredCard = null;
    updateChargeUI();
    return;
  }

  const landmarks = results.multiHandLandmarks[0];
  if (!isPointingGesture(landmarks)) {
    STATE.chargeProgress = 0;
    STATE.hoveredCard    = null;
    STATE.hoveredCardIdx = null;
    updateChargeUI();
    return;
  }

  // MediaPipe 坐标是归一化的 [0,1]，镜像翻转后映射到屏幕
  const tipX = (1 - landmarks[8].x) * window.innerWidth;
  const tipY = landmarks[8].y * window.innerHeight;

  const hit = _hitTestGesture(tipX, tipY);

  if (hit !== null && hit === lastHitIdx) {
    stableCount++;
    if (stableCount >= 3) updateCharge(hit);
  } else {
    stableCount  = 1;
    lastHitIdx   = hit;
    if (hit === null) {
      STATE.chargeProgress = 0;
      STATE.hoveredCard    = null;
      STATE.hoveredCardIdx = null;
    }
  }

  updateChargeUI();
}

function _hitTestGesture(screenX, screenY) {
  const cardEls = document.querySelectorAll('#card-tray .tarot-card');
  for (let i = 0; i < cardEls.length; i++) {
    if (cardEls[i].classList.contains('selected')) continue;
    const rect = cardEls[i].getBoundingClientRect();
    // 稍微放大碰撞区（指尖不精准）
    const pad = 10;
    if (screenX >= rect.left - pad && screenX <= rect.right  + pad &&
        screenY >= rect.top  - pad && screenY <= rect.bottom + pad) {
      return i;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7.4 — 蓄力逻辑
// ═══════════════════════════════════════════════════════════════════

const CHARGE_TIME      = 60;   // 帧数 ≈ 1s (60fps)
const CHARGE_PER_FRAME = 100 / CHARGE_TIME;

function updateCharge(cardIdx) {
  if (STATE.selectionLocked) return;

  const cardEls = document.querySelectorAll('#card-tray .tarot-card');
  const targetEl = cardEls[cardIdx];
  if (!targetEl || targetEl.classList.contains('selected')) return;

  if (STATE.hoveredCardIdx === cardIdx) {
    STATE.chargeProgress = Math.min(100, STATE.chargeProgress + CHARGE_PER_FRAME);
  } else {
    STATE.hoveredCardIdx = cardIdx;
    STATE.hoveredCard    = targetEl;
    STATE.chargeProgress = CHARGE_PER_FRAME;
  }

  if (STATE.chargeProgress >= 80) {
    _gestureSelectCard(cardIdx);
    STATE.chargeProgress = 0;
    STATE.hoveredCard    = null;
    STATE.hoveredCardIdx = null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7.5 — 蓄力环 SVG
// ═══════════════════════════════════════════════════════════════════

function updateChargeUI() {
  // 清除所有旧蓄力环
  document.querySelectorAll('.charge-ring').forEach(el => el.remove());
  if (!STATE.hoveredCard || STATE.chargeProgress <= 0) return;

  const card     = STATE.hoveredCard;
  const progress = STATE.chargeProgress / 100;
  const r        = 45;
  const circum   = 2 * Math.PI * r;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('charge-ring');
  svg.setAttribute('viewBox', '0 0 100 100');
  Object.assign(svg.style, {
    position:       'absolute',
    inset:          '-10px',
    zIndex:         '10',
    pointerEvents:  'none',
    width:          'calc(100% + 20px)',
    height:         'calc(100% + 20px)',
  });

  // 底圈（暗色轨道）
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', '50'); track.setAttribute('cy', '50');
  track.setAttribute('r', String(r));
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'rgba(201,169,110,0.15)');
  track.setAttribute('stroke-width', '3');
  svg.appendChild(track);

  // 进度圈
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  arc.setAttribute('cx', '50'); arc.setAttribute('cy', '50');
  arc.setAttribute('r', String(r));
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke', `rgba(201,169,110,${0.4 + progress * 0.55})`);
  arc.setAttribute('stroke-width', '3.5');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('stroke-dasharray',  String(circum));
  arc.setAttribute('stroke-dashoffset', String(circum * (1 - progress)));
  arc.setAttribute('transform', 'rotate(-90 50 50)');
  svg.appendChild(arc);

  // 高亮尖端点
  if (progress > 0.05) {
    const tipAngle = -Math.PI / 2 + progress * 2 * Math.PI;
    const tx = 50 + r * Math.cos(tipAngle);
    const ty = 50 + r * Math.sin(tipAngle);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(tx)); dot.setAttribute('cy', String(ty));
    dot.setAttribute('r', '3.5');
    dot.setAttribute('fill', 'rgba(255,230,160,0.95)');
    svg.appendChild(dot);
  }

  card.appendChild(svg);

  // 牌随蓄力微微放大
  const base = card.dataset.baseTransform || '';
  card.style.transform = base + ` scale(${1 + 0.10 * progress})`;
}

// ═══════════════════════════════════════════════════════════════════
// 内部选牌（手势 / 鼠标蓄力满触发）
// ═══════════════════════════════════════════════════════════════════

function _gestureSelectCard(cardIdx) {
  if (STATE.selectionLocked) return;

  const cardEls = document.querySelectorAll('#card-tray .tarot-card');
  const cardEl  = cardEls[cardIdx];
  if (!cardEl || cardEl.classList.contains('selected')) return;

  // 找到对应 card 数据（从 STATE.spread.cards[cardIdx] 取原始数据）
  const cardData = STATE.spread?.cards?.[cardIdx];
  if (!cardData) return;

  const alreadyIn = STATE.selectedCards.some(c => c.card_id === cardData.card_id);
  if (alreadyIn) return;

  const maxCount = STATE.spread.draw_count;
  if (STATE.selectedCards.length >= maxCount) return;

  const order = STATE.selectedCards.length + 1;

  // 爆开粒子
  const { x: bx, y: by } = _cardToCanvasXY(cardEl);
  burstParticles(bx, by, 28);

  // 飞入收集区
  flyToCollectArea(cardEl, order - 1, cardData);

  STATE.selectedCards.push({
    card_id:       cardData.card_id,
    orientation:   cardData.orientation,
    position_name: cardData.position_name,
    name:          cardData.name,
    order,
  });
  updateSelectProgress(STATE.selectedCards.length);

  if (STATE.selectedCards.length === maxCount) {
    STATE.selectionLocked = true;
    setTimeout(handleShowResult, 900);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7.7 — 牌飞入收集区
// ═══════════════════════════════════════════════════════════════════

const COLLECT_MINI_W = 44;
const COLLECT_MINI_H = 72;

function flyToCollectArea(cardEl, collectIdx, cardData) {
  const startRect = cardEl.getBoundingClientRect();

  // 先在收集区占位
  const collectArea = document.getElementById('card-collect-area');
  const slot = _ensureCollectSlot(collectArea, collectIdx, cardData);
  slot.style.opacity = '0';

  const endRect = slot.getBoundingClientRect();

  // 克隆牌用于飞行动画，不移动原牌
  const ghost = cardEl.cloneNode(true);
  Object.assign(ghost.style, {
    position:   'fixed',
    left:       startRect.left + 'px',
    top:        startRect.top  + 'px',
    width:      startRect.width  + 'px',
    height:     startRect.height + 'px',
    zIndex:     '2000',
    margin:     '0',
    transition: 'none',
    pointerEvents: 'none',
  });
  document.body.appendChild(ghost);

  // 贝塞尔中间控制点（向上抛出再落入）
  const midX  = (startRect.left + endRect.left) / 2 + (Math.random() - 0.5) * 60;
  const midY  = Math.min(startRect.top, endRect.top) - 90;
  const dur   = 520;
  const start = performance.now();

  function bezier(t) {
    // 二次贝塞尔
    const mt = 1 - t;
    return {
      x: mt * mt * startRect.left + 2 * mt * t * midX + t * t * endRect.left,
      y: mt * mt * startRect.top  + 2 * mt * t * midY + t * t * endRect.top,
    };
  }

  function animFrame(now) {
    const t = Math.min(1, (now - start) / dur);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const pos  = bezier(ease);
    const scale = 1 - ease * (1 - COLLECT_MINI_W / startRect.width);
    const rot   = Math.sin(ease * Math.PI) * 18;
    ghost.style.left      = pos.x + 'px';
    ghost.style.top       = pos.y + 'px';
    ghost.style.transform = `scale(${scale}) rotate(${rot}deg)`;
    ghost.style.opacity   = String(1 - ease * 0.15);

    if (t < 1) {
      requestAnimationFrame(animFrame);
    } else {
      // 到位 → 显示收集槽，移除幽灵
      ghost.remove();
      slot.style.opacity   = '1';
      slot.style.transform = 'scale(1)';
      // 小弹跳
      slot.animate(
        [{ transform: 'scale(1.25)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'ease-out' }
      );
      // 原位置牌标记选中但不显示（已被 ghost 替代）
      cardEl.style.opacity = '0';
      cardEl.classList.add('selected');
      const badge = cardEl.querySelector('.selected-badge');
      if (badge) badge.textContent = collectIdx + 1;
    }
  }
  requestAnimationFrame(animFrame);
}

function _ensureCollectSlot(area, idx, cardData) {
  // 复用已有 slot
  let slot = area.querySelector(`[data-slot="${idx}"]`);
  if (slot) return slot;

  slot = document.createElement('div');
  slot.dataset.slot  = idx;
  slot.className     = 'collect-slot';
  slot.style.cssText = `
    width: ${COLLECT_MINI_W}px; height: ${COLLECT_MINI_H}px;
    border: 1px solid rgba(201,169,110,0.5); border-radius: 5px;
    background: rgba(201,169,110,0.07); position: relative;
    overflow: hidden; flex-shrink: 0; transform: scale(0.8);
    transition: opacity 0.15s ease;
  `;

  // 缩略图
  const img = document.createElement('img');
  img.src    = getCardImagePath(cardData.card_id);
  img.alt    = cardData.name || '';
  img.onerror = () => { img.style.display = 'none'; };
  Object.assign(img.style, {
    width:      '100%',
    height:     '100%',
    objectFit:  'cover',
    borderRadius: '4px',
  });
  if (cardData.orientation === 'Reversed') img.style.transform = 'rotate(180deg)';

  // 名称标签
  const label = document.createElement('div');
  label.textContent = cardData.name || `#${cardData.card_id}`;
  Object.assign(label.style, {
    position:   'absolute',
    bottom:     '0',
    left:       '0', right: '0',
    textAlign:  'center',
    fontSize:   '0.52rem',
    color:      '#e8dcc8',
    background: 'rgba(10,10,20,0.75)',
    padding:    '1px 2px',
    whiteSpace: 'nowrap',
    overflow:   'hidden',
    textOverflow: 'ellipsis',
  });

  // 位置角标
  const badge = document.createElement('div');
  badge.textContent = String(idx + 1);
  Object.assign(badge.style, {
    position:   'absolute',
    top: '3px', right: '3px',
    width: '14px', height: '14px',
    borderRadius: '50%',
    background: 'rgba(201,169,110,0.9)',
    color: '#0a0a14',
    fontSize: '0.6rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  slot.appendChild(img);
  slot.appendChild(label);
  slot.appendChild(badge);
  area.appendChild(slot);
  return slot;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7.8 — 鼠标降级：hover 蓄力 + click 即选
// ═══════════════════════════════════════════════════════════════════

let mouseChargeInterval = null;
let mouseHoverIdx       = null;

/**
 * 为所有 .tarot-card 绑定鼠标降级事件。
 * 在 selecting 场景入场后调用。
 */
function bindMouseFallback() {
  const cardEls = document.querySelectorAll('#card-tray .tarot-card');
  cardEls.forEach((el, i) => {
    // 移除旧监听（防止重复绑定）
    el.removeEventListener('mouseenter', el._mEnter);
    el.removeEventListener('mouseleave', el._mLeave);
    el.removeEventListener('click',      el._mClick);

    el._mEnter = () => {
      if (STATE.gestureEnabled)   return;
      if (STATE.selectionLocked)  return;
      if (el.classList.contains('selected')) return;

      mouseHoverIdx          = i;
      STATE.hoveredCard      = el;
      STATE.hoveredCardIdx   = i;
      STATE.chargeProgress   = 0;

      mouseChargeInterval = setInterval(() => {
        if (STATE.selectionLocked || STATE.phase !== 'selecting') {
          clearInterval(mouseChargeInterval); return;
        }
        STATE.chargeProgress = Math.min(100, STATE.chargeProgress + CHARGE_PER_FRAME);
        updateChargeUI();
        if (STATE.chargeProgress >= 80) {
          clearInterval(mouseChargeInterval);
          _gestureSelectCard(mouseHoverIdx);
          STATE.chargeProgress = 0;
          STATE.hoveredCard    = null;
          STATE.hoveredCardIdx = null;
        }
      }, 16);
    };

    el._mLeave = () => {
      clearInterval(mouseChargeInterval);
      STATE.chargeProgress = 0;
      STATE.hoveredCard    = null;
      STATE.hoveredCardIdx = null;
      updateChargeUI();
    };

    el._mClick = () => {
      // 点击直接选中（无需蓄力满）
      clearInterval(mouseChargeInterval);
      STATE.chargeProgress = 0;
      STATE.hoveredCard    = null;
      STATE.hoveredCardIdx = null;
      updateChargeUI();
      if (!STATE.selectionLocked && !el.classList.contains('selected')) {
        _gestureSelectCard(i);
      }
    };

    el.addEventListener('mouseenter', el._mEnter);
    el.addEventListener('mouseleave', el._mLeave);
    el.addEventListener('click',      el._mClick);
  });
}

/** 清除鼠标蓄力（场景离开时调用） */
function clearMouseFallback() {
  clearInterval(mouseChargeInterval);
  mouseChargeInterval = null;
  mouseHoverIdx       = null;
}

// ═══════════════════════════════════════════════════════════════════
// 对外接口汇总（供 app.js 调用）
// ═══════════════════════════════════════════════════════════════════
// startSway / stopSway
// initParticleCanvas
// updateGestureHint
// initMediaPipe
// updateChargeUI
// burstParticles
// flyToCollectArea
// bindMouseFallback
// clearMouseFallback
