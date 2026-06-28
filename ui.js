/**
 * ui.js — 3D Ring Carousel Edition (Fixed)
 *
 * 修复清单：
 *   ① perspective 移到父容器 #carousel-stage（新增），card-tray 内部用 transform-style:preserve-3d
 *   ② card-tray 的 overflow 改为 visible，让两侧牌显示出来；裁剪由外层 stage 控制
 *   ③ 增加洗牌入场动画：所有牌从中心叠加 → 随机飞散 → 归位圆环
 *   ④ 修复 _applyCarousel 坐标：牌定位在 stage 中心，不再用 left/top 偏移
 *   ⑤ 修复 _handleClick：传入 clientY，正确做2D命中检测
 */

// ── 场景节点缓存 ─────────────────────────────────────────────────────────
const SCENE_ELS = {
  entry:     document.getElementById('scene-entry'),
  preparing: document.getElementById('scene-preparing'),
  spreading: document.getElementById('scene-spreading'),
  selecting: document.getElementById('scene-selecting'),
  revealing: document.getElementById('scene-revealing'),
  reading:   document.getElementById('scene-reading'),
  done:      document.getElementById('scene-done'),
};

// ── 场景切换（opacity 淡入淡出）─────────────────────────────────────────
function setPhase(phase) {
  Object.entries(SCENE_ELS).forEach(([key, el]) => {
    if (!el) return;
    if (key === phase) {
      el.classList.add('active');
      void el.offsetHeight;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { el.classList.add('visible'); });
      });
    } else {
      if (el.classList.contains('visible')) {
        el.classList.remove('visible');
        const onEnd = () => {
          el.classList.remove('active');
          el.removeEventListener('transitionend', onEnd);
        };
        el.addEventListener('transitionend', onEnd);
        setTimeout(() => {
          el.classList.remove('active');
          el.removeEventListener('transitionend', onEnd);
        }, 350);
      } else {
        el.classList.remove('active');
      }
    }
  });
}

(function initFirstScene() {
  const entryEl = SCENE_ELS.entry;
  if (entryEl) {
    entryEl.classList.add('active');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { entryEl.classList.add('visible'); });
    });
  }
})();


// ══════════════════════════════════════════════════════════════════════
// 3D 环形轮播系统（完全重写）
//
// 架构：
//   #carousel-stage  ← perspective 在这里（新元素，由 layoutCards 创建）
//     #card-tray     ← transform-style: preserve-3d，overflow: visible
//       .tarot-card  ← 绝对定位在 stage 中心，通过 translateX/Z/rotateY 分布
//
// 核心改变：
//   - perspective 在父层，3D透视才能正确穿越子元素
//   - card-tray overflow:visible，侧面的牌不被裁剪
//   - 每张牌的 left/top 固定在 50%/50%，transform 做所有位移
// ══════════════════════════════════════════════════════════════════════

let _carouselAngle = 0;  // 当前旋转角度（度）
let _cardStep      = 0;  // 每张牌的角度间隔
let _totalCards    = 0;

const CARD_W = 80;
const CARD_H = 128;

/**
 * 根据当前 _carouselAngle 更新所有牌的 3D 变换
 */
function _applyCarousel(cardEls, instant = false) {
  const n = cardEls.length;
  if (n === 0) return;

  const stage = document.getElementById('carousel-stage');
  const W = stage ? stage.offsetWidth  : (window.innerWidth  * 0.9);

  // 椭圆轨道半径
  const RX = Math.min(W * 0.42, 320);  // 水平半径
  const RZ = Math.min(W * 0.28, 220);  // 深度半径

  const transStr = instant
    ? 'none'
    : 'transform 0.28s cubic-bezier(0.25,0.8,0.35,1), opacity 0.25s ease, box-shadow 0.2s ease';

  cardEls.forEach((el, i) => {
    // 计算此牌的视角角度（相对于当前正中心）
    const rawAngle = i * _cardStep - _carouselAngle;
    const angle    = ((rawAngle % 360) + 540) % 360 - 180;  // [-180, 180]
    const rad      = angle * Math.PI / 180;

    const x  = Math.sin(rad) * RX;
    const z  = Math.cos(rad) * RZ - RZ;         // 最前 z=0，向后 z=-2RZ
    const y  = -Math.abs(Math.sin(rad)) * 20;   // 轻微弧度上扬

    // 深度 → scale / opacity
    const depth   = (z + RZ * 2) / (RZ * 2);   // [0,1]  0=最后 1=最前
    const scale   = 0.50 + depth * 0.50;
    const opacity = 0.22 + depth * 0.78;

    // 侧面牌朝向圆心旋转
    const selfRotY = -angle * 0.28;

    // 背面不可见（|angle|>90 实际已不可见，但依旧 visibility 控制节省渲染）
    const visible  = Math.abs(angle) < 94;
    const zIdx     = Math.round(depth * 300);

    el.style.transition = transStr;
    el.style.transform  =
      `translateX(${x}px) translateY(${y}px) translateZ(${z}px) rotateY(${selfRotY}deg) scale(${scale})`;
    el.style.opacity    = visible ? String(opacity) : '0';
    el.style.zIndex     = String(zIdx);
    el.style.visibility = visible ? 'visible' : 'hidden';

    // 正中牌高亮
    const isFront = Math.abs(angle) < _cardStep * 0.6;
    el.dataset.isFront = isFront ? '1' : '0';
    if (isFront && !el.classList.contains('selected')) {
      el.style.boxShadow = '0 0 0 1.5px rgba(201,169,110,0.8), 0 8px 40px rgba(201,169,110,0.35)';
      el.style.filter    = 'brightness(1.1)';
    } else if (!el.classList.contains('selected')) {
      el.style.boxShadow = 'none';
      el.style.filter    = '';
    }
  });
}

/**
 * layoutCards — 初始化3D轮播
 * 会创建 #carousel-stage 包裹层（如果不存在）并配置 perspective
 */
function layoutCards(cardEls, _skipAnim = false) {
  if (!cardEls || !cardEls.length) return;

  _totalCards    = cardEls.length;
  _cardStep      = 360 / _totalCards;
  _carouselAngle = 0;

  const tray = document.getElementById('card-tray');
  if (!tray) return;

  // ── 确保 carousel-stage 包裹层存在 ──────────────────────────────────
  let stage = document.getElementById('carousel-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'carousel-stage';
    tray.parentNode.insertBefore(stage, tray);
    stage.appendChild(tray);
  }

  // stage：perspective + overflow:hidden（裁剪边缘，但不影响3D）
  Object.assign(stage.style, {
    position:        'relative',
    width:           '100%',
    height:          '320px',
    perspective:     '900px',
    perspectiveOrigin: '50% 50%',
    overflow:        'hidden',
    flexShrink:      '0',
  });

  // tray：3D空间容器，overflow:visible 让牌能超出自身范围
  Object.assign(tray.style, {
    position:        'absolute',
    left:            '0',
    top:             '0',
    width:           '100%',
    height:          '100%',
    transformStyle:  'preserve-3d',
    overflow:        'visible',
    cursor:          'grab',
    userSelect:      'none',
  });

  // 每张牌定位在 stage 中心，transform 做位移
  cardEls.forEach((el, i) => {
    el.style.position       = 'absolute';
    el.style.left           = `calc(50% - ${CARD_W / 2}px)`;
    el.style.top            = `calc(50% - ${CARD_H / 2}px)`;
    el.style.width          = `${CARD_W}px`;
    el.style.height         = `${CARD_H}px`;
    el.style.transformOrigin = 'center center';
    el.style.cursor         = 'pointer';
    el.style.willChange     = 'transform, opacity';
    el.style.backfaceVisibility = 'hidden';
    el.dataset.idx          = String(i);
  });

  // 先 instant 渲染到位
  _applyCarousel(cardEls, true);
}

/**
 * animateSpread — 洗牌入场动画
 *
 * 阶段1（0-400ms）：所有牌从圆环位置缩到中心叠成一叠（模拟"收牌"）
 * 阶段2（400-900ms）：随机飞散（洗牌）
 * 阶段3（900-1500ms）：归位到3D圆环
 * 完成后回调 onDone
 */
function animateSpread(cardEls, onDone) {
  if (!cardEls || !cardEls.length) { if (onDone) onDone(); return; }

  const n = cardEls.length;

  // ── 阶段1：先确保所有牌处于圆环位置（instant），无动画 ────────────────
  _applyCarousel(cardEls, true);

  // ── 阶段2（50ms后）：飞到中心叠成一叠 ──────────────────────────────────
  setTimeout(() => {
    cardEls.forEach((el, i) => {
      const delay = Math.random() * 120;
      el.style.transition = `transform ${280 + delay}ms cubic-bezier(0.4,0,0.2,1) ${delay}ms, opacity 200ms ease ${delay}ms`;
      // 叠在中心，随机小旋转模拟真实牌叠
      const rot = (Math.random() - 0.5) * 24;
      const tx  = (Math.random() - 0.5) * 8;
      const ty  = (Math.random() - 0.5) * 8;
      el.style.transform  = `translateX(${tx}px) translateY(${ty}px) translateZ(0px) rotateZ(${rot}deg) rotateY(0deg) scale(0.82)`;
      el.style.opacity    = String(0.3 + Math.random() * 0.4);
      el.style.zIndex     = String(i);
      el.style.visibility = 'visible';
    });
  }, 50);

  // ── 阶段3（500ms后）：随机飞散（洗牌感）────────────────────────────────
  setTimeout(() => {
    cardEls.forEach((el, i) => {
      const delay = Math.random() * 200;
      el.style.transition = `transform ${220}ms ease-out ${delay}ms, opacity 180ms ease ${delay}ms`;
      const angle = (Math.random() * 360) * Math.PI / 180;
      const dist  = 60 + Math.random() * 100;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist * 0.5;
      const rot = (Math.random() - 0.5) * 60;
      el.style.transform = `translateX(${tx}px) translateY(${ty}px) translateZ(0px) rotateZ(${rot}deg) scale(0.75)`;
      el.style.opacity   = '0.45';
    });
  }, 500);

  // ── 阶段4（900ms后）：归位3D圆环 ────────────────────────────────────────
  setTimeout(() => {
    cardEls.forEach((el, i) => {
      const delay = i * (380 / n);  // 顺序入场，整圈约380ms
      el.style.transition = `transform 480ms cubic-bezier(0.34,1.2,0.64,1) ${delay}ms, opacity 350ms ease ${delay}ms`;
    });
    // 用 _applyCarousel 直接写最终状态，transition 会做补间
    _applyCarousel(cardEls, false);
  }, 900);

  // ── 完成回调 ──────────────────────────────────────────────────────────
  setTimeout(() => {
    if (onDone) onDone();
  }, 900 + 380 + 550);  // 等动画完全结束
}

/**
 * 获取距中心最近的牌索引
 */
function getFrontCardIdx() {
  if (_totalCards === 0) return 0;
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < _totalCards; i++) {
    const raw = i * _cardStep - _carouselAngle;
    const a   = ((raw % 360) + 540) % 360 - 180;
    if (Math.abs(a) < bestDist) { bestDist = Math.abs(a); best = i; }
  }
  return best;
}

/**
 * 吸附到最近的牌
 */
function snapToNearest(cardEls) {
  const idx   = getFrontCardIdx();
  const target = idx * _cardStep;
  let delta = target - _carouselAngle;
  delta = ((delta % 360) + 540) % 360 - 180;
  _carouselAngle += delta;
  if (cardEls) _applyCarousel(cardEls);
}

// ── 选中/取消 ─────────────────────────────────────────────────────────────
function markCardSelected(cardEl, order) {
  cardEl.classList.add('selected');
  const badge = cardEl.querySelector('.selected-badge');
  if (badge) badge.textContent = order;
  cardEl.style.filter    = 'brightness(1.2)';
  cardEl.style.boxShadow = '0 0 0 2px rgba(201,169,110,1), 0 0 28px 8px rgba(201,169,110,0.6)';
}

function markCardDeselected(cardEl) {
  cardEl.classList.remove('selected');
  const badge = cardEl.querySelector('.selected-badge');
  if (badge) badge.textContent = '';
  cardEl.style.filter    = '';
  cardEl.style.boxShadow = 'none';
}

function clearAllCardSelections() {
  document.querySelectorAll('.tarot-card.selected').forEach(el => markCardDeselected(el));
}

// ── 进度 ─────────────────────────────────────────────────────────────────
function updateSelectProgress(count) {
  const el = document.getElementById('selected-count');
  if (el) el.textContent = count;
}

// ── 选牌场景渲染 ──────────────────────────────────────────────────────────
function renderSelectingScene(spread, question, onCardClick) {
  const nameLabel  = document.getElementById('spread-name-label');
  const posLabel   = document.getElementById('spread-positions-label');
  const qLabel     = document.getElementById('spread-question-label');
  const totalCount = document.getElementById('total-count');
  const selCount   = document.getElementById('selected-count');

  if (nameLabel)  nameLabel.textContent  = spread.spread_name;
  if (posLabel)   posLabel.textContent   = '位置：' + spread.positions.join(' · ');
  if (qLabel)     qLabel.textContent     = '「' + question + '」';
  if (totalCount) totalCount.textContent = spread.draw_count;
  if (selCount)   selCount.textContent   = '0';
  hideError('selecting-error');

  const tray = document.getElementById('card-tray');
  tray.innerHTML     = '';
  tray.dataset.count = DECK.length;

  const fragment = document.createDocumentFragment();
  DECK.forEach((card, idx) => {
    fragment.appendChild(buildCardElement(card, idx, onCardClick));
  });
  tray.appendChild(fragment);
}

function buildCardElement(card, idx, onCardClick) {
  const el       = document.createElement('div');
  el.className   = 'tarot-card';
  el.dataset.idx = idx;

  const cardId = card.card_id ?? card.id;

  const imageLayer     = document.createElement('div');
  imageLayer.className = 'card-image';
  const img            = document.createElement('img');
  img.src     = getCardImagePath(cardId);
  img.alt     = card.name || `Card ${cardId}`;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.onerror = () => { img.style.display = 'none'; };
  imageLayer.appendChild(img);

  const backLayer     = document.createElement('div');
  backLayer.className = 'card-back-layer';
  backLayer.innerHTML = cardBackSVG();

  const badge     = document.createElement('div');
  badge.className = 'selected-badge';

  const nameLabel       = document.createElement('div');
  nameLabel.className   = 'card-label';
  nameLabel.textContent = card.name || `#${cardId}`;

  el.appendChild(imageLayer);
  el.appendChild(backLayer);
  el.appendChild(badge);
  el.appendChild(nameLabel);

  el.addEventListener('click', () => onCardClick(el, card, idx));
  return el;
}

// ── 收集区 ────────────────────────────────────────────────────────────────
function updateCollectArea(selectedCards) {
  const area = document.getElementById('card-collect-area');
  if (!area) return;
  area.innerHTML = '';
  selectedCards.forEach(card => {
    const chip       = document.createElement('div');
    chip.className   = 'collect-chip';
    chip.textContent = card.name || `#${card.card_id}`;
    area.appendChild(chip);
  });
}

// ── 结果 / 解读场景 ────────────────────────────────────────────────────────
function renderResultScene(question, selectedCards) {
  const label = document.getElementById('result-question-label');
  if (label) label.textContent = '「' + question + '」';
  const list = document.getElementById('result-list');
  if (!list) return;
  list.innerHTML = '';
  selectedCards.forEach(card => {
    const isReversed = card.orientation === 'Reversed';
    const item       = document.createElement('div');
    item.className   = 'result-item';
    const posEl      = document.createElement('div');
    posEl.className  = 'result-pos';
    posEl.textContent = card.position_name;
    const nameEl     = document.createElement('div');
    nameEl.className = 'result-name';
    nameEl.textContent = card.name || `Card #${card.card_id}`;
    const orientEl   = document.createElement('div');
    orientEl.className = 'result-orientation' + (isReversed ? ' reversed' : '');
    orientEl.textContent = isReversed ? '逆位' : '正位';
    item.appendChild(posEl);
    item.appendChild(nameEl);
    item.appendChild(orientEl);
    list.appendChild(item);
  });
}

// ── 输入框 ────────────────────────────────────────────────────────────────
function getQuestionInputValue() {
  return (document.getElementById('question-input').value || '').trim();
}
function clearQuestionInput() {
  document.getElementById('question-input').value = '';
}

// ── 错误提示 ─────────────────────────────────────────────────────────────
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent   = message;
  el.style.display = 'block';
}
function hideError(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.style.display = 'none';
}

// ── 工具函数 ──────────────────────────────────────────────────────────────
function getCardImagePath(cardId) {
  if (!Number.isInteger(cardId) || cardId < 0 || cardId > 77) return '';
  if (cardId <= 21)
    return `assets/cards/ar${String(cardId).padStart(2, '0')}.jpg`;
  const SUIT_PREFIX  = ['wa', 'cu', 'sw', 'pe'];
  const COURT_SUFFIX = ['pa', 'kn', 'qu', 'ki'];
  const offset  = cardId - 22;
  const suitIdx = Math.floor(offset / 14);
  const rank    = (offset % 14) + 1;
  const prefix  = SUIT_PREFIX[suitIdx];
  if (rank === 1)  return `assets/cards/${prefix}ac.jpg`;
  if (rank <= 10)  return `assets/cards/${prefix}${String(rank).padStart(2, '0')}.jpg`;
  return `assets/cards/${prefix}${COURT_SUFFIX[rank - 11]}.jpg`;
}

function cardBackSVG() {
  return `
  <svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg">
    <rect width="60" height="100" rx="3" fill="none"/>
    <rect x="4" y="4" width="52" height="92" rx="2"
          fill="none" stroke="#c9a96e" stroke-width="0.8" opacity="0.4"/>
    <polygon points="30,12 52,50 30,88 8,50"
             fill="none" stroke="#c9a96e" stroke-width="0.8" opacity="0.4"/>
    <polygon points="30,22 46,50 30,78 14,50"
             fill="none" stroke="#c9a96e" stroke-width="0.6" opacity="0.3"/>
    <polygon points="30,32 40,50 30,68 20,50"
             fill="none" stroke="#c9a96e" stroke-width="0.5" opacity="0.25"/>
    <circle cx="30" cy="50" r="2" fill="#c9a96e" opacity="0.4"/>
  </svg>`;
}

// 旧兼容桩
function calcFanConfig() {
  return { CARD_W, CARD_H, RADIUS: 300, ANGLE_MIN: -80, ANGLE_MAX: 80, TRAY_PADDING_TOP: 24 };
}
