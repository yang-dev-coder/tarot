/**
 * ui.js — Phase 10 改造
 *
 * 改动：
 *   - setPhase：display:none↔flex 改为 opacity 过渡（active + visible 双 class）
 *   - 其余逻辑与原版一致
 */

// ── 扇形布局常量（与 CSS --card-w/h 保持一致）────────────────────────────
const FAN_CONFIG = {
  RADIUS:           320,
  ANGLE_MIN:        -80,
  ANGLE_MAX:         80,
  CARD_W:            70,
  CARD_H:           120,
  TRAY_PADDING_TOP:  24,
};

// ── 选中 / hover 视觉常量 ─────────────────────────────────────────────────
const HOVER_GLOW   = '0 0 14px 3px rgba(201,169,110,0.55)';
const SELECT_GLOW  = '0 0 18px 5px rgba(201,169,110,0.80)';
const HOVER_SCALE  = 'scale(1.08)';
const SELECT_SCALE = 'scale(1.10)';

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

// ── Phase 10：场景切换（opacity 淡入淡出）────────────────────────────────

/**
 * setPhase — 先让旧场景淡出，再让新场景淡入。
 * 利用 active（display:flex）+ visible（opacity:1）双 class 实现过渡。
 */
function setPhase(phase) {
  Object.entries(SCENE_ELS).forEach(([key, el]) => {
    if (!el) return;

    if (key === phase) {
      // 先加 active（display:flex），下一帧加 visible（opacity:1）
      el.classList.add('active');
      // 强制 reflow，让浏览器识别到 opacity 从 0 开始
      void el.offsetHeight;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.add('visible');
        });
      });
    } else {
      // 淡出：先移除 visible，等过渡完再移除 active
      if (el.classList.contains('visible')) {
        el.classList.remove('visible');
        // 等 CSS transition 完成（0.3s）再 display:none
        const onEnd = () => {
          el.classList.remove('active');
          el.removeEventListener('transitionend', onEnd);
        };
        el.addEventListener('transitionend', onEnd);
        // 保底兜底：350ms 后强制移除（防止 transitionend 不触发）
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

// 初始化：entry 场景直接可见（页面加载后无过渡直接显示）
(function initFirstScene() {
  const entryEl = SCENE_ELS.entry;
  if (entryEl) {
    entryEl.classList.add('active');
    // 延迟一帧加 visible，让首屏有轻微淡入
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        entryEl.classList.add('visible');
      });
    });
  }
})();

// ── 选牌场景 ───────────────────────────────────────────────────────────────
function renderSelectingScene(spread, question, onCardClick) {
  document.getElementById('spread-name-label').textContent      = spread.spread_name;
  document.getElementById('spread-positions-label').textContent = '位置：' + spread.positions.join(' · ');
  document.getElementById('spread-question-label').textContent  = '「' + question + '」';
  document.getElementById('total-count').textContent            = spread.draw_count;
  document.getElementById('selected-count').textContent         = '0';
  hideError('selecting-error');

  const tray = document.getElementById('card-tray');
  tray.innerHTML = '';
  tray.dataset.count = spread.cards.length;

  const fragment = document.createDocumentFragment();
  spread.cards.forEach((card, idx) => {
    fragment.appendChild(buildCardElement(card, idx, onCardClick));
  });
  tray.appendChild(fragment);
}

function buildCardElement(card, idx, onCardClick) {
  const el = document.createElement('div');
  el.className   = 'tarot-card';
  el.dataset.idx = idx;

  const imageLayer     = document.createElement('div');
  imageLayer.className = 'card-image';
  const img            = document.createElement('img');
  img.src              = getCardImagePath(card.card_id);
  img.alt              = card.name || `Card ${card.card_id}`;
  img.loading          = 'lazy';
  img.decoding         = 'async';
  if (card.orientation === 'Reversed') img.classList.add('reversed');
  img.onerror          = () => { img.style.display = 'none'; };
  imageLayer.appendChild(img);

  const backLayer     = document.createElement('div');
  backLayer.className = 'card-back-layer';
  backLayer.innerHTML = cardBackSVG();

  const badge     = document.createElement('div');
  badge.className = 'selected-badge';

  const nameLabel       = document.createElement('div');
  nameLabel.className   = 'card-label';
  nameLabel.textContent = card.name || `#${card.card_id}`;

  el.appendChild(imageLayer);
  el.appendChild(backLayer);
  el.appendChild(badge);
  el.appendChild(nameLabel);

  el.addEventListener('click', () => onCardClick(el, card, idx));

  return el;
}

// ── 扇形布局 ───────────────────────────────────────────────────────────────

function layoutCards(cardEls, skipAnim = false) {
  if (!cardEls || cardEls.length === 0) return;

  const { RADIUS, ANGLE_MIN, ANGLE_MAX, CARD_W, CARD_H, TRAY_PADDING_TOP } = FAN_CONFIG;

  const n     = cardEls.length;
  const tray  = document.getElementById('card-tray');
  const trayH = RADIUS + CARD_H / 2 + TRAY_PADDING_TOP;
  const trayW = Math.max(tray.offsetWidth || 760, 2 * (RADIUS + CARD_W / 2 + 16));

  const cx = trayW / 2;
  const cy = trayH;

  tray.style.position = 'relative';
  tray.style.width    = '100%';
  tray.style.height   = trayH + 'px';
  tray.style.display  = 'block';

  cardEls.forEach((el, i) => {
    const angleDeg = n === 1
      ? 0
      : ANGLE_MIN + (i / (n - 1)) * (ANGLE_MAX - ANGLE_MIN);
    const angleRad = angleDeg * Math.PI / 180;

    const dx =  RADIUS * Math.sin(angleRad);
    const dy = -RADIUS * Math.cos(angleRad);

    const baseZ = String(100 - Math.abs(i - Math.floor(n / 2)));
    const baseTransform =
      `translateX(${dx}px) translateY(${dy}px) rotate(${angleDeg}deg)`;

    el.dataset.baseTransform = baseTransform;
    el.dataset.baseZ         = baseZ;

    el.style.position        = 'absolute';
    el.style.left            = cx - CARD_W / 2 + 'px';
    el.style.top             = cy - CARD_H / 2 + 'px';
    el.style.width           = CARD_W + 'px';
    el.style.height          = CARD_H + 'px';
    el.style.transformOrigin = 'center bottom';
    el.style.zIndex          = baseZ;
    el.style.boxShadow       = 'none';
    el.style.transition      = 'box-shadow 0.15s ease, filter 0.15s ease, opacity 0.4s ease';

    if (skipAnim) {
      el.style.transform = baseTransform;
      el.style.opacity   = '1';
    } else {
      el.style.transform = 'translateX(0) translateY(0) rotate(0deg)';
      el.style.opacity   = '0';
    }

    el.addEventListener('mouseenter', () => {
      if (el.classList.contains('selected')) return;
      el.style.transform = baseTransform + ' ' + HOVER_SCALE;
      el.style.zIndex    = '200';
      el.style.boxShadow = HOVER_GLOW;
    });

    el.addEventListener('mouseleave', () => {
      if (el.classList.contains('selected')) {
        el.style.transform = baseTransform + ' ' + SELECT_SCALE;
        el.style.zIndex    = '150';
        el.style.boxShadow = SELECT_GLOW;
      } else {
        el.style.transform = baseTransform;
        el.style.zIndex    = baseZ;
        el.style.boxShadow = 'none';
      }
    });
  });
}

function animateSpread(cardEls, onDone) {
  if (!cardEls || cardEls.length === 0) {
    if (onDone) onDone();
    return;
  }

  const STAGGER = 38;

  cardEls.forEach((el, i) => {
    const delay = i * STAGGER;
    const baseT = el.dataset.baseTransform || '';

    setTimeout(() => {
      el.style.transition = `transform 0.55s cubic-bezier(0.22, 0.8, 0.4, 1) ${delay}ms,
                             opacity  0.45s ease ${delay}ms,
                             box-shadow 0.15s ease,
                             filter 0.15s ease`;
      el.style.transform  = baseT;
      el.style.opacity    = '1';
    }, 0);
  });

  const totalDuration = STAGGER * (cardEls.length - 1) + 600;
  if (onDone) setTimeout(onDone, totalDuration);
}

// ── 进度更新 ───────────────────────────────────────────────────────────────
function updateSelectProgress(count) {
  document.getElementById('selected-count').textContent = count;
}

function markCardSelected(cardEl, order) {
  cardEl.classList.add('selected');
  const badge = cardEl.querySelector('.selected-badge');
  if (badge) badge.textContent = order;
  const base = cardEl.dataset.baseTransform || '';
  cardEl.style.transform = base + ' ' + SELECT_SCALE;
  cardEl.style.zIndex    = '150';
  cardEl.style.boxShadow = SELECT_GLOW;
}

function markCardDeselected(cardEl) {
  cardEl.classList.remove('selected');
  const badge = cardEl.querySelector('.selected-badge');
  if (badge) badge.textContent = '';
  const base  = cardEl.dataset.baseTransform || '';
  const baseZ = cardEl.dataset.baseZ         || '100';
  cardEl.style.transform = base;
  cardEl.style.zIndex    = baseZ;
  cardEl.style.boxShadow = 'none';
}

function clearAllCardSelections() {
  document.querySelectorAll('.tarot-card.selected').forEach(el => {
    markCardDeselected(el);
  });
}

// ── 收集区 ────────────────────────────────────────────────────────────────
function updateCollectArea(selectedCards) {
  const area = document.getElementById('card-collect-area');
  if (!area) return;
  area.innerHTML = '';
  selectedCards.forEach(card => {
    const chip = document.createElement('div');
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

    const posEl       = document.createElement('div');
    posEl.className   = 'result-pos';
    posEl.textContent = card.position_name;

    const nameEl      = document.createElement('div');
    nameEl.className  = 'result-name';
    nameEl.textContent = card.name || `Card #${card.card_id}`;

    const orientEl    = document.createElement('div');
    orientEl.className = 'result-orientation' + (isReversed ? ' reversed' : '');
    orientEl.textContent = isReversed ? '逆位' : '正位';

    item.appendChild(posEl);
    item.appendChild(nameEl);
    item.appendChild(orientEl);
    list.appendChild(item);
  });
}

// ── 输入框操作 ─────────────────────────────────────────────────────────────
function getQuestionInputValue() {
  return document.getElementById('question-input').value.trim();
}

function clearQuestionInput() {
  document.getElementById('question-input').value = '';
}

// ── 错误提示 ───────────────────────────────────────────────────────────────
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

// ── 工具函数 ───────────────────────────────────────────────────────────────
function getCardImagePath(cardId) {
  if (cardId < 22) {
    const num = String(cardId).padStart(2, '0');
    return `assets/cards/rws_m${num}.jpg`;
  }
  const SUITS   = ['wa', 'cu', 'sw', 'pe'];
  const suitIdx = Math.floor((cardId - 22) / 14);
  const pipNum  = ((cardId - 22) % 14) + 1;
  const suit    = SUITS[suitIdx] ?? 'wa';
  const num     = String(pipNum).padStart(2, '0');
  return `assets/cards/rws_${suit}${num}.jpg`;
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
