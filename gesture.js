/**
 * gesture.js — 3D Ring Carousel Edition (Fixed)
 *
 * 修复清单：
 *   ① _handleClick 现在正确传入并使用 clientY 做命中检测
 *   ② 拖拽速度系数调优（原来太快），手感更真实
 *   ③ bindDragRotation 改绑到 carousel-stage（父层），
 *      card-tray overflow:visible 时 tray 无实际可点击面积
 *   ④ 保留粒子系统 / 手势蓄力 / MediaPipe 全部原始逻辑
 */

// ═══════════════════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════════════════

const DRAG_THRESHOLD   = 10;    // px，小于此距离视为点击
const CHARGE_TIME      = 55;    // 帧数 ≈ 0.9s (60fps)
const CHARGE_PER_FRAME = 100 / CHARGE_TIME;
const AMBIENT_COUNT    = 32;

// ═══════════════════════════════════════════════════════════════════
// 摇摆 stub
// ═══════════════════════════════════════════════════════════════════

function startSway() {}
function stopSway()  {}

// ═══════════════════════════════════════════════════════════════════
// 粒子系统
// ═══════════════════════════════════════════════════════════════════

let particleCanvas    = null;
let particleCtx       = null;
let particleRAF       = null;
let ambientParticles  = [];
let burstParticleList = [];
let attractTarget     = null;

function initParticleCanvas() {
  const stage = document.getElementById('carousel-stage') || document.getElementById('card-tray');
  if (!stage) return;
  destroyParticleCanvas();

  particleCanvas = document.createElement('canvas');
  particleCanvas.id = 'particle-canvas';
  Object.assign(particleCanvas.style, {
    position: 'absolute', inset: '0',
    width: '100%', height: '100%',
    zIndex: '400', pointerEvents: 'none',
  });
  stage.appendChild(particleCanvas);
  particleCtx = particleCanvas.getContext('2d');
  _resizeCanvas();
  window.addEventListener('resize', _resizeCanvas);
  _spawnAmbient();
  _particleTick();
}

function destroyParticleCanvas() {
  if (particleRAF) { cancelAnimationFrame(particleRAF); particleRAF = null; }
  window.removeEventListener('resize', _resizeCanvas);
  const ex = document.getElementById('particle-canvas');
  if (ex) ex.remove();
  particleCanvas = null; particleCtx = null;
  ambientParticles = []; burstParticleList = []; attractTarget = null;
}

function _resizeCanvas() {
  if (!particleCanvas) return;
  const parent = particleCanvas.parentElement;
  if (!parent) return;
  particleCanvas.width  = parent.offsetWidth  || 760;
  particleCanvas.height = parent.offsetHeight || 340;
}

function _spawnAmbient() {
  ambientParticles = [];
  const W = particleCanvas ? (particleCanvas.width  || 760) : 760;
  const H = particleCanvas ? (particleCanvas.height || 340) : 340;
  for (let i = 0; i < AMBIENT_COUNT; i++) {
    ambientParticles.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
      r: 0.7 + Math.random() * 1.3,
      alpha: 0.15 + Math.random() * 0.30,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function _particleTick() {
  if (!particleCtx || !particleCanvas) return;
  particleRAF = requestAnimationFrame(_particleTick);
  const W = particleCanvas.width, H = particleCanvas.height;
  particleCtx.clearRect(0, 0, W, H);

  ambientParticles.forEach(p => {
    p.phase += 0.022;
    const glow = Math.sin(p.phase) * 0.10;
    if (attractTarget) {
      const dx = attractTarget.x - p.x, dy = attractTarget.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      p.vx += (dx / dist) * 0.07; p.vy += (dy / dist) * 0.07;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 3.2) { p.vx *= 3.2 / sp; p.vy *= 3.2 / sp; }
    }
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > W) { p.vx *= -0.9; p.x = Math.max(0, Math.min(W, p.x)); }
    if (p.y < 0 || p.y > H) { p.vy *= -0.9; p.y = Math.max(0, Math.min(H, p.y)); }
    particleCtx.beginPath();
    particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    particleCtx.fillStyle = `rgba(201,169,110,${Math.min(1, p.alpha + glow)})`;
    particleCtx.fill();
  });
  if (attractTarget) ambientParticles.forEach(p => { p.vx *= 0.97; p.vy *= 0.97; });

  burstParticleList = burstParticleList.filter(p => p.age < p.life);
  burstParticleList.forEach(p => {
    p.age += 0.032; p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.93;
    const t = 1 - p.age / p.life;
    particleCtx.beginPath();
    particleCtx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
    particleCtx.fillStyle = `rgba(201,169,110,${t * 0.9})`;
    particleCtx.fill();
    particleCtx.beginPath();
    particleCtx.arc(p.x - p.vx * 2, p.y - p.vy * 2, p.size * t * 0.4, 0, Math.PI * 2);
    particleCtx.fillStyle = `rgba(255,230,160,${t * 0.35})`;
    particleCtx.fill();
  });
}

function burstParticles(canvasX, canvasY, count = 28) {
  attractTarget = { x: canvasX, y: canvasY };
  setTimeout(() => { attractTarget = null; }, 550);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    burstParticleList.push({
      x: canvasX, y: canvasY,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: 2.2 + Math.random() * 2.5, life: 0.9, age: 0,
    });
  }
}

function _cardToCanvasXY(cardEl) {
  if (!particleCanvas) return { x: 0, y: 0 };
  const cr = cardEl.getBoundingClientRect();
  const pr = particleCanvas.getBoundingClientRect();
  return { x: (cr.left + cr.width / 2) - pr.left, y: (cr.top + cr.height / 2) - pr.top };
}

// ═══════════════════════════════════════════════════════════════════
// 手势提示
// ═══════════════════════════════════════════════════════════════════

function updateGestureHint() {
  const el = document.getElementById('gesture-hint');
  if (!el) return;
  if (STATE.gestureEnabled) {
    el.textContent = '✋ 张开手掌左右移动旋转牌阵 · ☝️ 食指悬停蓄力选中';
  } else {
    el.textContent = '← 左右拖拽旋转牌阵 · 点击选牌 →';
  }
}

// ═══════════════════════════════════════════════════════════════════
// 蓄力环 UI
// ═══════════════════════════════════════════════════════════════════

function updateChargeUI() {
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
    position: 'absolute', inset: '-10px', zIndex: '10',
    pointerEvents: 'none',
    width: 'calc(100% + 20px)', height: 'calc(100% + 20px)',
  });

  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', '50'); track.setAttribute('cy', '50');
  track.setAttribute('r', String(r)); track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'rgba(201,169,110,0.15)');
  track.setAttribute('stroke-width', '3');
  svg.appendChild(track);

  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  arc.setAttribute('cx', '50'); arc.setAttribute('cy', '50');
  arc.setAttribute('r', String(r)); arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke', `rgba(201,169,110,${0.4 + progress * 0.55})`);
  arc.setAttribute('stroke-width', '3.5');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('stroke-dasharray',  String(circum));
  arc.setAttribute('stroke-dashoffset', String(circum * (1 - progress)));
  arc.setAttribute('transform', 'rotate(-90 50 50)');
  svg.appendChild(arc);

  if (progress > 0.05) {
    const tipAngle = -Math.PI / 2 + progress * 2 * Math.PI;
    const tx = 50 + r * Math.cos(tipAngle), ty = 50 + r * Math.sin(tipAngle);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(tx)); dot.setAttribute('cy', String(ty));
    dot.setAttribute('r', '3.5'); dot.setAttribute('fill', 'rgba(255,230,160,0.95)');
    svg.appendChild(dot);
  }

  card.appendChild(svg);
}

// ═══════════════════════════════════════════════════════════════════
// MediaPipe Hands
// ═══════════════════════════════════════════════════════════════════

let mpHands  = null;
let mpCamera = null;

async function initMediaPipe() {
  if (!STATE.gestureEnabled) return;
  if (typeof Hands === 'undefined') {
    STATE.gestureEnabled = false;
    updateGestureHint();
    return;
  }
  try {
    mpHands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${f}` });
    mpHands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
    mpHands.onResults(onHandResults);
    const videoEl = document.getElementById('camera-feed');
    mpCamera = new Camera(videoEl, {
      onFrame: async () => { await mpHands.send({ image: videoEl }); },
      width: 640, height: 480,
    });
    mpCamera.start();
    updateGestureHint();
  } catch (e) {
    STATE.gestureEnabled = false;
    updateGestureHint();
  }
}

function isPointingGesture(landmarks) {
  return (
    landmarks[8].y  < landmarks[6].y  &&
    landmarks[12].y > landmarks[10].y &&
    landmarks[16].y > landmarks[14].y &&
    landmarks[20].y > landmarks[18].y
  );
}

/**
 * 检测张开手掌（5 指都伸直）→ 拖拽旋转模式
 * 与 isPointingGesture 互斥：指向只有食指伸直，张掌是四指全伸直
 */
function isOpenPalmGesture(landmarks) {
  return (
    landmarks[8].y  < landmarks[6].y  &&
    landmarks[12].y < landmarks[10].y &&
    landmarks[16].y < landmarks[14].y &&
    landmarks[20].y < landmarks[18].y
  );
}

let stableCount = 0, lastHitIdx = null;
const STABLE_THRESHOLD = 10;  // 需连续10帧（~0.17s@60fps）命中同一张牌才开始蓄力（原3帧太快易误触）
let _gestureHoverIdx = null;         // 当前食指悬停的牌索引（弹起视觉反馈）
let _hoverTrail = new Map();          // 牌索引 → 首次经过时间戳（经过牌短暂弹起效果）
const HOVER_TRAIL_DURATION = 800;    // 经过牌弹起持续时间(ms)

// ── 手掌拖拽旋转状态 ──────────────────────────────────────────────────────
let _gestureDragActive = false;   // 当前是否处于手掌拖拽模式
let _gestureLastX      = 0;       // 上一帧手掌 X（屏幕坐标，已镜像）

function onHandResults(results) {
  if (STATE.phase !== 'selecting') return;
  if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
    // 手离开画面 → 清理两种模式
    if (_gestureDragActive) {
      _gestureDragActive = false;
      _momentum();               // 手松开 → 惯性滑行
    }
    STATE.hoveredCard = null;
    STATE.hoveredCardIdx = null;
    STATE.chargeProgress = 0;
    _gestureHoverIdx = null;
    updateChargeUI();
    return;
  }

  const landmarks = results.multiHandLandmarks[0];

  // ── 优先检测张开手掌 → 拖拽旋转 ──────────────────────────────────────
  if (isOpenPalmGesture(landmarks)) {
    // 切换到手掌模式 → 清除蓄力选牌状态 + 食指悬停
    STATE.chargeProgress = 0;
    STATE.hoveredCard = null;
    STATE.hoveredCardIdx = null;
    _gestureHoverIdx = null;
    updateChargeUI();

    // 用中指掌指关节（landmark 9）作为手掌中心，比指尖更稳定
    const palmX = (1 - landmarks[9].x) * window.innerWidth;

    if (!_gestureDragActive) {
      // 首帧 → 进入拖拽，记录起点，取消残留惯性
      if (_drag.momentumRAF) { cancelAnimationFrame(_drag.momentumRAF); _drag.momentumRAF = null; }
      _gestureDragActive = true;
      _gestureLastX      = palmX;
      _drag.velocity     = 0;
    } else {
      // 后续帧 → 用 X 增量驱动旋转（和鼠标 _onDragMove 同一套公式）
      const dx    = palmX - _gestureLastX;
      const stage = document.getElementById('carousel-stage');
      const W     = stage ? stage.offsetWidth : (window.innerWidth * 0.85);
      const dAngle = (dx / W) * 180;
      _carouselAngle  -= dAngle;
      _drag.velocity   = dx * 0.5;    // 供 _momentum 使用
      _gestureLastX    = palmX;
      if (_cardElsRef) _applyCarousel(_cardElsRef);
    }
    return;
  }

  // ── 不是张掌 → 如果之前在拖拽，收尾惯性 ───────────────────────────────
  if (_gestureDragActive) {
    _gestureDragActive = false;
    _momentum();
  }

  // ── 食指指向 → 蓄力选牌（原有逻辑）────────────────────────────────────
  if (!isPointingGesture(landmarks)) {
    STATE.chargeProgress = 0; STATE.hoveredCard = null; STATE.hoveredCardIdx = null;
    _gestureHoverIdx = null;
    updateChargeUI(); return;
  }
  const tipX = (1 - landmarks[8].x) * window.innerWidth;
  const tipY = landmarks[8].y * window.innerHeight;
  const hit  = _hitTestGesture(tipX, tipY);

  // 更新食指悬停索引 + 经过牌 trail（弹起视觉反馈）
  _gestureHoverIdx = hit;
  if (hit !== null && !_hoverTrail.has(hit)) {
    _hoverTrail.set(hit, performance.now());
  }

  if (hit !== null && hit === lastHitIdx) {
    stableCount++;
    if (stableCount >= STABLE_THRESHOLD) updateCharge(hit);
  } else {
    stableCount = 1; lastHitIdx = hit;
    if (hit === null) { STATE.chargeProgress = 0; STATE.hoveredCard = null; STATE.hoveredCardIdx = null; _gestureHoverIdx = null; }
  }
  updateChargeUI();
}

function _hitTestGesture(screenX, screenY) {
  const cardEls = document.querySelectorAll('#card-tray .tarot-card');
  // 第一轮：收集所有命中（缩紧 padding 减少重叠误触）
  const candidates = [];
  for (let i = 0; i < cardEls.length; i++) {
    if (cardEls[i].classList.contains('selected')) continue;
    if (cardEls[i].style.visibility === 'hidden') continue;
    if (parseFloat(cardEls[i].style.opacity || '1') < 0.20) continue;
    const rect = cardEls[i].getBoundingClientRect();
    const pad = 4;  // 缩小 padding（原 12px 太宽，密集牌阵易跨牌命中）
    if (screenX >= rect.left - pad && screenX <= rect.right  + pad &&
        screenY >= rect.top  - pad && screenY <= rect.bottom + pad) {
      candidates.push({ el: cardEls[i], idx: i, rect, zIndex: parseInt(cardEls[i].style.zIndex || '0') });
    }
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].idx;

  // 多张牌同时命中时（密集区常见）：优先选最靠近正中心角度的牌
  candidates.sort((a, b) => b.zIndex - a.zIndex);
  let best = candidates[0];
  // 用 isFront 数据或角度判断：dataset.isFront='1' 的优先
  for (const c of candidates) {
    if (c.el.dataset.isFront === '1') return c.idx;
  }
  // 其次选 zIndex 最高的（最靠前的）
  return best.idx;
}

function updateCharge(cardIdx) {
  if (STATE.selectionLocked) return;
  const cardEls = document.querySelectorAll('#card-tray .tarot-card');
  const targetEl = cardEls[cardIdx];
  if (!targetEl || targetEl.classList.contains('selected')) return;
  if (STATE.hoveredCardIdx === cardIdx) {
    STATE.chargeProgress = Math.min(100, STATE.chargeProgress + CHARGE_PER_FRAME);
  } else {
    STATE.hoveredCardIdx = cardIdx; STATE.hoveredCard = targetEl; STATE.chargeProgress = CHARGE_PER_FRAME;
  }
  if (STATE.chargeProgress >= 80) {
    _gestureSelectCard(cardIdx);
    STATE.chargeProgress = 0; STATE.hoveredCard = null; STATE.hoveredCardIdx = null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 内部选牌（手势 / 点击）
// ═══════════════════════════════════════════════════════════════════

function _gestureSelectCard(cardIdx) {
  if (STATE.selectionLocked) return;
  const cardEls = document.querySelectorAll('#card-tray .tarot-card');
  const cardEl  = cardEls[cardIdx];
  if (!cardEl || cardEl.classList.contains('selected')) return;

  const cardData = DECK[cardIdx];
  if (!cardData) return;

  const alreadyIn = STATE.selectedCards.some(c => c.card_id === (cardData.card_id ?? cardData.id));
  if (alreadyIn) return;

  const maxCount = STATE.spread ? STATE.spread.draw_count : 3;
  if (STATE.selectedCards.length >= maxCount) return;

  const order       = STATE.selectedCards.length + 1;
  const drawnCard   = STATE.spread?.cards?.[order - 1];
  const orientation = drawnCard?.orientation ?? 'Upright';

  const { x: bx, y: by } = _cardToCanvasXY(cardEl);
  burstParticles(bx, by, 28);

  flyToCollectArea(cardEl, order - 1, { ...cardData, id: cardData.card_id ?? cardData.id, orientation });

  const positionName     = STATE.spread?.positions?.[order - 1]          ?? `位置${order}`;
  const positionSemantic = STATE.spread?.position_semantics?.[order - 1] ?? '';

  STATE.selectedCards.push({
    card_id: cardData.card_id ?? cardData.id,
    orientation,
    position_name: positionName,
    position_semantic: positionSemantic,
    name: cardData.name,
    order,
  });
  updateSelectProgress(STATE.selectedCards.length);

  if (STATE.selectedCards.length === maxCount) {
    STATE.selectionLocked = true;
    setTimeout(handleShowResult, 900);
  }
}

// ═══════════════════════════════════════════════════════════════════
// flyToCollectArea
// ═══════════════════════════════════════════════════════════════════

const COLLECT_MINI_W = 44;
const COLLECT_MINI_H = 72;

function flyToCollectArea(cardEl, collectIdx, cardData) {
  const startRect   = cardEl.getBoundingClientRect();
  const collectArea = document.getElementById('card-collect-area');
  const slot        = _ensureCollectSlot(collectArea, collectIdx, cardData);
  slot.style.opacity = '0';
  const endRect     = slot.getBoundingClientRect();

  const ghost = document.createElement('div');
  Object.assign(ghost.style, {
    position:      'fixed',
    left:          startRect.left + 'px',
    top:           startRect.top  + 'px',
    width:         startRect.width  + 'px',
    height:        startRect.height + 'px',
    zIndex:        '3000',
    margin:        '0',
    transition:    'none',
    pointerEvents: 'none',
    borderRadius:  '5px',
    background:    'var(--bg)',
    border:        '1px solid rgba(201,169,110,0.5)',
    overflow:      'hidden',
  });
  const ghostImg = document.createElement('img');
  ghostImg.src = getCardImagePath(cardData.card_id ?? cardData.id);
  ghostImg.style.cssText = 'width:100%;height:100%;object-fit:cover;';
  ghost.appendChild(ghostImg);
  document.body.appendChild(ghost);

  const midX  = (startRect.left + endRect.left) / 2 + (Math.random() - 0.5) * 60;
  const midY  = Math.min(startRect.top, endRect.top) - 80;
  const dur   = 520;
  const start = performance.now();

  function bezier(t) {
    const mt = 1 - t;
    return {
      x: mt*mt*startRect.left + 2*mt*t*midX + t*t*endRect.left,
      y: mt*mt*startRect.top  + 2*mt*t*midY + t*t*endRect.top,
    };
  }

  function animFrame(now) {
    const t    = Math.min(1, (now - start) / dur);
    const ease = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
    const pos  = bezier(ease);
    const sc   = 1 - ease * (1 - COLLECT_MINI_W / startRect.width);
    const rot  = Math.sin(ease * Math.PI) * 18;
    ghost.style.left      = pos.x + 'px';
    ghost.style.top       = pos.y + 'px';
    ghost.style.transform = `scale(${sc}) rotate(${rot}deg)`;
    ghost.style.opacity   = String(1 - ease * 0.15);
    if (t < 1) {
      requestAnimationFrame(animFrame);
    } else {
      ghost.remove();
      slot.style.opacity   = '1';
      slot.style.transform = 'scale(1)';
      slot.animate(
        [{ transform: 'scale(1.25)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'ease-out' }
      );
      cardEl.style.opacity = '0.25';
      cardEl.classList.add('selected');
      const badge = cardEl.querySelector('.selected-badge');
      if (badge) badge.textContent = collectIdx + 1;
    }
  }
  requestAnimationFrame(animFrame);
}

function _ensureCollectSlot(area, idx, cardData) {
  let slot = area.querySelector(`[data-slot="${idx}"]`);
  if (slot) return slot;

  slot = document.createElement('div');
  slot.dataset.slot  = idx;
  slot.className     = 'collect-slot';
  slot.style.cssText = `
    width:${COLLECT_MINI_W}px; height:${COLLECT_MINI_H}px;
    border:1px solid rgba(201,169,110,0.5); border-radius:5px;
    background:rgba(201,169,110,0.07); position:relative;
    overflow:hidden; flex-shrink:0; transform:scale(0.8);
    transition:opacity 0.15s ease;
  `;

  const img      = document.createElement('img');
  img.src        = getCardImagePath(cardData.card_id ?? cardData.id);
  img.alt        = cardData.name || '';
  img.onerror    = () => { img.style.display = 'none'; };
  Object.assign(img.style, { width:'100%', height:'100%', objectFit:'cover', borderRadius:'4px' });
  if ((cardData.orientation ?? '') === 'Reversed') img.style.transform = 'rotate(180deg)';

  const label       = document.createElement('div');
  label.textContent = cardData.name || `#${cardData.card_id ?? cardData.id}`;
  Object.assign(label.style, {
    position:'absolute', bottom:'0', left:'0', right:'0', textAlign:'center',
    fontSize:'0.52rem', color:'#e8dcc8', background:'rgba(10,10,20,0.75)',
    padding:'1px 2px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
  });

  const badge       = document.createElement('div');
  badge.textContent = String(idx + 1);
  Object.assign(badge.style, {
    position:'absolute', top:'3px', right:'3px', width:'14px', height:'14px',
    borderRadius:'50%', background:'rgba(201,169,110,0.9)', color:'#0a0a14',
    fontSize:'0.6rem', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center',
  });

  slot.appendChild(img);
  slot.appendChild(label);
  slot.appendChild(badge);
  area.appendChild(slot);
  return slot;
}

// ═══════════════════════════════════════════════════════════════════
// 拖拽旋转系统（修复版）
//
// 改为绑定到 #carousel-stage（包裹层），因为 card-tray 的 overflow:visible
// 导致其自身可接受事件的面积取决于内容，不稳定。
// stage 有固定宽高，是更可靠的事件接收层。
// ═══════════════════════════════════════════════════════════════════

let _drag = {
  active:      false,
  startX:      0,
  startY:      0,
  lastX:       0,
  startAngle:  0,
  velocity:    0,
  moved:       false,
  momentumRAF: null,
};

let _cardElsRef = null;

function bindDragRotation(cardEls) {
  _cardElsRef = Array.from(cardEls);

  // 优先绑定到 carousel-stage，没有时回退 card-tray
  const target = document.getElementById('carousel-stage') || document.getElementById('card-tray');
  if (!target) return;

  // 清除旧监听
  if (target._onMouseDown)  { target.removeEventListener('mousedown',  target._onMouseDown); }
  if (target._onTouchStart) { target.removeEventListener('touchstart', target._onTouchStart); }

  target._onMouseDown = (e) => {
    if (STATE.selectionLocked || STATE.phase !== 'selecting') return;
    e.preventDefault();
    _startDrag(e.clientX, e.clientY);

    const onMove = (ev) => _onDragMove(ev.clientX, ev.clientY);
    const onUp   = (ev) => {
      _endDrag(ev.clientX, ev.clientY);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  };

  target._onTouchStart = (e) => {
    if (STATE.selectionLocked || STATE.phase !== 'selecting') return;
    const touch = e.touches[0];
    _startDrag(touch.clientX, touch.clientY);

    const onMove = (ev) => _onDragMove(ev.touches[0].clientX, ev.touches[0].clientY);
    const onEnd  = (ev) => {
      const t = ev.changedTouches[0];
      _endDrag(t.clientX, t.clientY);
      target.removeEventListener('touchmove', onMove);
      target.removeEventListener('touchend',  onEnd);
    };
    target.addEventListener('touchmove', onMove, { passive: false });
    target.addEventListener('touchend',  onEnd);
  };

  target.addEventListener('mousedown',  target._onMouseDown);
  target.addEventListener('touchstart', target._onTouchStart, { passive: true });
}

function _startDrag(clientX, clientY) {
  if (_drag.momentumRAF) { cancelAnimationFrame(_drag.momentumRAF); _drag.momentumRAF = null; }
  _drag.active     = true;
  _drag.startX     = clientX;
  _drag.startY     = clientY;
  _drag.lastX      = clientX;
  _drag.startAngle = _carouselAngle;
  _drag.velocity   = 0;
  _drag.moved      = false;
}

function _onDragMove(clientX, clientY) {
  if (!_drag.active || !_cardElsRef) return;
  const dx = clientX - _drag.startX;
  if (!_drag.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
  _drag.moved = true;

  // 阻止 touchmove 的页面滚动
  const stage = document.getElementById('carousel-stage');
  const W = stage ? stage.offsetWidth : (window.innerWidth * 0.85);

  // 拖动灵敏度：移动半屏宽 = 旋转约2~3张牌的距离（更自然）
  const dAngle = (dx / W) * 180;
  _carouselAngle = _drag.startAngle - dAngle;

  _drag.velocity = (clientX - _drag.lastX) * 0.5;
  _drag.lastX    = clientX;
  _applyCarousel(_cardElsRef);
}

function _endDrag(clientX, clientY) {
  if (!_drag.active) return;
  _drag.active = false;

  if (!_drag.moved) {
    _handleClick(clientX, clientY);
    return;
  }
  _momentum();
}

/**
 * 点击命中检测（修复：现在正确使用 clientY）
 * 找到 getBoundingClientRect 包含点击坐标、且 zIndex 最高的非已选牌
 */
function _handleClick(clientX, clientY) {
  const cardEls = Array.from(document.querySelectorAll('#card-tray .tarot-card'));
  const hits = cardEls
    .filter(el => {
      if (el.classList.contains('selected'))       return false;
      if (el.style.visibility === 'hidden')        return false;
      if (parseFloat(el.style.opacity || '1') < 0.20) return false;  // 过滤极淡的侧牌
      const rect = el.getBoundingClientRect();
      return (
        clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top  && clientY <= rect.bottom
      );
    })
    .sort((a, b) => parseInt(b.style.zIndex || 0) - parseInt(a.style.zIndex || 0));

  if (hits.length > 0) {
    const el  = hits[0];
    const idx = parseInt(el.dataset.idx ?? '0');
    _gestureSelectCard(idx);
  }
}

function _momentum() {
  if (!_cardElsRef) return;
  const decel = 0.90;
  let vel = _drag.velocity;

  function step() {
    if (Math.abs(vel) < 0.25) {
      snapToNearest(_cardElsRef);
      return;
    }
    const stage = document.getElementById('carousel-stage');
    const W = stage ? stage.offsetWidth : window.innerWidth;
    _carouselAngle -= (vel / W) * 180;
    _applyCarousel(_cardElsRef);
    vel *= decel;
    _drag.momentumRAF = requestAnimationFrame(step);
  }
  _drag.momentumRAF = requestAnimationFrame(step);
}

// ── 兼容桩 ────────────────────────────────────────────────────────────────
function bindMouseFallback() { /* no-op: 已整合进 bindDragRotation */ }

function clearMouseFallback() {
  if (_drag.momentumRAF) { cancelAnimationFrame(_drag.momentumRAF); _drag.momentumRAF = null; }
  _drag.active = false;
  _gestureDragActive = false;
}
