/**
 * app.js — 3D Ring Carousel Edition (Fixed)
 *
 * 修复：
 *   ① enterSpreading 改为搬移 #carousel-stage（包含 tray），而非单独搬 tray
 *   ② spreading 场景结束后，将 carousel-stage 归还到 scene-selecting 的正确位置
 *   ③ handleRestart 同样归还 carousel-stage
 */

// ── 摄像头授权 ─────────────────────────────────────────────────────────────

async function requestCamera() {
  const TIMEOUT = 8_000;
  try {
    const streamPromise = navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('camera_timeout')), TIMEOUT)
    );
    const stream = await Promise.race([streamPromise, timeoutPromise]);
    const videoEl = document.getElementById('camera-feed');
    if (videoEl) videoEl.srcObject = stream;
    STATE.cameraReady    = true;
    STATE.gestureEnabled = true;
  } catch {
    STATE.cameraReady    = false;
    STATE.gestureEnabled = false;
  }
}

// ── 呼吸光点消散 ─────────────────────────────────────────────────────────────

function animateBreathOut(onDone) {
  const light = document.getElementById('breath-light');
  if (!light) { if (onDone) onDone(); return; }
  light.classList.add('burst');
  setTimeout(() => { light.style.display = 'none'; if (onDone) onDone(); }, 700);
}

// ── 主流程：开始占卜 ─────────────────────────────────────────────────────────

function handleStart() {
  hideError('entry-error');
  const question = getQuestionInputValue();
  if (!question) {
    showError('entry-error', '请写下你想问的问题');
    document.getElementById('question-input').focus();
    return;
  }

  STATE.question        = question;
  STATE.selectedCards   = [];
  STATE.selectionLocked = false;
  STATE.activated       = false;

  animateBreathOut(() => {
    STATE.phase = 'preparing';
    setPhase('preparing');

    const cameraTask = requestCamera();
    const apiTask    = callPrepareAPI(question);

    Promise.all([cameraTask, apiTask])
      .then(([, data]) => {
        STATE.spread    = data;
        STATE.drawCount = data.draw_count;

        // 展示牌阵名
        const hint = document.getElementById('preparing-spread-hint');
        if (hint) {
          hint.textContent = `✦ 为你选择了「${data.spread_name}」· ${data.positions.join(' / ')}`;
          hint.style.opacity = '1';
        }
        setTimeout(() => enterSpreading(data), 1000);
      })
      .catch(err => {
        console.error('prepare error:', err);
        STATE.phase = 'entry';
        const light = document.getElementById('breath-light');
        if (light) { light.classList.remove('burst'); light.style.display = ''; }
        showError('entry-error', '连接中断，请重试');
        setPhase('entry');
      });
  });
}

// ── spreading：洗牌 + 3D 轨道展开 ────────────────────────────────────────────

function enterSpreading(data) {
  STATE.phase = 'spreading';

  // 渲染 78 张牌到 card-tray
  renderSelectingScene(data, STATE.question, _noopCardClick);

  // layoutCards 会创建/配置 #carousel-stage，并把 tray 放进去
  const tray = document.getElementById('card-tray');
  const cardEls = Array.from(tray.querySelectorAll('.tarot-card'));
  layoutCards(cardEls, false);

  // 把 carousel-stage 搬到 spreading-card-area（如果不在那里）
  const stage = document.getElementById('carousel-stage');
  const spreadingContainer = document.getElementById('spreading-card-area');
  if (stage && spreadingContainer && stage.parentElement !== spreadingContainer) {
    spreadingContainer.appendChild(stage);
  }

  setPhase('spreading');

  // 洗牌动画，结束后进入 selecting
  animateSpread(cardEls, () => {
    // 把 carousel-stage 移回 selecting 场景的正确位置
    const selectingScene = document.getElementById('scene-selecting');
    const stageEl        = document.getElementById('carousel-stage');
    if (selectingScene && stageEl) {
      // 插入到 gesture-hint 之前
      const gestureHint = selectingScene.querySelector('#gesture-hint');
      if (gestureHint) {
        selectingScene.insertBefore(stageEl, gestureHint);
      } else {
        selectingScene.appendChild(stageEl);
      }
    }

    STATE.phase = 'selecting';
    setPhase('selecting');

    STATE.activated = true;
    _startSelectingInteraction(cardEls);
  });
}

/** 启动 selecting 场景的全部交互 */
function _startSelectingInteraction(cardEls) {
  initParticleCanvas();
  bindDragRotation(cardEls);
  updateGestureHint();
  if (STATE.cameraReady) initMediaPipe();
}

function _noopCardClick() {}

// ── handleReset ─────────────────────────────────────────────────────────────

function handleReset() {
  STATE.selectedCards   = [];
  STATE.selectionLocked = false;
  STATE.chargeProgress  = 0;
  STATE.hoveredCard     = null;
  STATE.hoveredCardIdx  = null;

  clearMouseFallback();
  clearAllCardSelections();
  hideError('selecting-error');
  updateSelectProgress(0);

  const area = document.getElementById('card-collect-area');
  if (area) area.innerHTML = '';

  const cardEls = Array.from(document.querySelectorAll('#card-tray .tarot-card'));
  cardEls.forEach(el => {
    el.classList.remove('selected');
    el.style.opacity = '';
    const badge = el.querySelector('.selected-badge');
    if (badge) badge.textContent = '';
  });

  bindDragRotation(cardEls);
  _carouselAngle = 0;
  _applyCarousel(cardEls, true);
}

// ── Phase 8：revealing → 翻牌动画 ────────────────────────────────────────

function handleShowResult() {
  STATE.phase = 'revealing';
  setPhase('revealing');
  stopSway();
  destroyParticleCanvas();

  const revealScene = document.getElementById('scene-revealing');
  const collectArea = document.getElementById('card-collect-area');
  if (revealScene && collectArea) revealScene.appendChild(collectArea);

  setTimeout(() => {
    flipRevealCards(STATE.selectedCards, () => {
      setTimeout(() => { startReading(); }, 1000);
    });
  }, 400);
}

function flipRevealCards(selectedCards, onAllFlipped) {
  const collectArea = document.getElementById('card-collect-area');
  if (!collectArea) { if (onAllFlipped) onAllFlipped(); return; }
  const slots = Array.from(collectArea.querySelectorAll('.collect-slot'));
  if (!slots.length) { if (onAllFlipped) onAllFlipped(); return; }

  const FLIP_INTERVAL = 520;
  slots.forEach((slot, i) => {
    const card = selectedCards[i];
    if (!card) return;
    setTimeout(() => {
      _flipSlot(slot, card);
      document.body.classList.add('screen-shake');
      setTimeout(() => document.body.classList.remove('screen-shake'), 320);
      if (i === slots.length - 1) {
        setTimeout(() => { if (onAllFlipped) onAllFlipped(); }, 600);
      }
    }, i * FLIP_INTERVAL);
  });
}

function _flipSlot(slot, cardData) {
  if (slot.dataset.flipped === '1') return;
  slot.dataset.flipped = '1';

  const isReversed = cardData.orientation === 'Reversed';
  const isMajor    = cardData.card_id < 22;

  slot.innerHTML = '';
  Object.assign(slot.style, {
    perspective: '600px', transformStyle: 'preserve-3d',
    position: 'relative', cursor: 'default', width: '72px', height: '116px',
  });

  const inner = document.createElement('div');
  inner.className = 'flip-inner';
  Object.assign(inner.style, {
    position: 'relative', width: '100%', height: '100%',
    transformStyle: 'preserve-3d',
    transition: 'transform 0.55s cubic-bezier(0.4, 0.2, 0.2, 1)',
  });

  const back = document.createElement('div');
  back.className = 'flip-back';
  Object.assign(back.style, {
    position: 'absolute', inset: '0', backfaceVisibility: 'hidden',
    borderRadius: '5px', background: 'var(--bg)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  });
  back.innerHTML = `
    <svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" style="width:70%;opacity:0.5">
      <rect x="4" y="4" width="52" height="92" rx="2" fill="none" stroke="#c9a96e" stroke-width="0.8" opacity="0.4"/>
      <polygon points="30,12 52,50 30,88 8,50" fill="none" stroke="#c9a96e" stroke-width="0.8" opacity="0.4"/>
      <polygon points="30,22 46,50 30,78 14,50" fill="none" stroke="#c9a96e" stroke-width="0.6" opacity="0.3"/>
      <circle cx="30" cy="50" r="2" fill="#c9a96e" opacity="0.4"/>
    </svg>`;

  const front = document.createElement('div');
  front.className = 'flip-front';
  Object.assign(front.style, {
    position: 'absolute', inset: '0', backfaceVisibility: 'hidden',
    transform: 'rotateY(180deg)', borderRadius: '5px', overflow: 'hidden',
    border: '1px solid rgba(201,169,110,0.6)',
    boxShadow: '0 0 18px 4px rgba(201,169,110,0.35)',
  });

  const img = document.createElement('img');
  img.src = getCardImagePath(cardData.card_id);
  img.alt = cardData.name || '';
  img.onerror = () => { img.style.display = 'none'; };
  Object.assign(img.style, {
    width: '100%', height: '100%', objectFit: 'cover',
    borderRadius: '4px', display: 'block',
    transform: isReversed ? 'rotate(180deg)' : 'none',
  });
  front.appendChild(img);

  inner.appendChild(back);
  inner.appendChild(front);
  slot.appendChild(inner);

  const posLabel = document.createElement('div');
  posLabel.textContent = cardData.position_name || '';
  Object.assign(posLabel.style, {
    position: 'absolute', top: '-22px', left: '50%', transform: 'translateX(-50%)',
    fontSize: '0.6rem', color: 'var(--gold)', whiteSpace: 'nowrap',
    opacity: '0', transition: 'opacity 0.4s ease 0.3s',
    fontFamily: 'var(--font-display)', letterSpacing: '0.05em',
  });
  slot.appendChild(posLabel);

  const nameLabel = document.createElement('div');
  nameLabel.textContent = (isMajor ? '★ ' : '') + (cardData.name || '');
  Object.assign(nameLabel.style, {
    position: 'absolute', bottom: '-26px', left: '50%', transform: 'translateX(-50%)',
    fontSize: '0.6rem', color: 'var(--text)', whiteSpace: 'nowrap',
    opacity: '0', transition: 'opacity 0.4s ease 0.5s',
    textAlign: 'center', maxWidth: '96px', overflow: 'hidden', textOverflow: 'ellipsis',
  });
  slot.appendChild(nameLabel);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      inner.style.transform = 'rotateY(180deg)';
      setTimeout(() => {
        slot.style.transition = 'box-shadow 0.3s ease';
        slot.style.boxShadow  = '0 0 28px 8px rgba(201,169,110,0.5)';
        setTimeout(() => { slot.style.boxShadow = '0 0 8px 2px rgba(201,169,110,0.2)'; }, 350);
      }, 280);
      setTimeout(() => { posLabel.style.opacity = '1'; nameLabel.style.opacity = '1'; }, 400);
    });
  });
}

// ── Phase 9：reading 场景 ─────────────────────────────────────────────────

function startReading() {
  STATE.phase = 'reading';
  renderResultScene(STATE.question, STATE.selectedCards);
  _buildRevealedCardsRow(STATE.selectedCards);
  setPhase('reading');

  const loadingEl  = document.getElementById('reading-loading');
  const contentEl  = document.getElementById('reading-content');
  const restartBtn = document.getElementById('restart-btn');

  if (loadingEl) loadingEl.style.display = 'flex';
  if (contentEl) { contentEl.style.display = 'none'; contentEl.innerHTML = ''; }
  if (restartBtn) restartBtn.style.display = 'none';

  let firstChunk = true;

  const CARD_SEP   = '——CARD_END——';
  let   sepBuf     = '';
  let   paused     = false;
  let   pauseQueue = [];
  let   cardLitIdx = 0;

  function _lightUpNextCard() {
    const row   = document.getElementById('revealed-cards-row');
    if (!row) return;
    const wraps = row.querySelectorAll('[data-card-thumb]');
    if (wraps[cardLitIdx]) {
      const imgWrap = wraps[cardLitIdx].querySelector('.thumb-img-wrap');
      if (imgWrap) {
        imgWrap.style.transition  = 'border-color 0.3s ease, box-shadow 0.3s ease';
        imgWrap.style.borderColor = 'rgba(201,169,110,0.9)';
        imgWrap.style.boxShadow   = '0 0 14px 4px rgba(201,169,110,0.45)';
      }
      cardLitIdx++;
    }
  }

  function _drainQueue() { paused = false; pauseQueue.forEach(ch => _processChunk(ch)); pauseQueue = []; }

  function _processChunk(ch) {
    if (paused) { pauseQueue.push(ch); return; }
    sepBuf += ch;
    if (!sepBuf.includes(CARD_SEP)) {
      const safeLen = Math.max(0, sepBuf.length - CARD_SEP.length);
      if (safeLen > 0) { _appendChunkToReading(contentEl, sepBuf.slice(0, safeLen)); sepBuf = sepBuf.slice(safeLen); }
      return;
    }
    const sepStart = sepBuf.indexOf(CARD_SEP);
    if (sepStart > 0) _appendChunkToReading(contentEl, sepBuf.slice(0, sepStart));
    sepBuf = sepBuf.slice(sepStart + CARD_SEP.length);
    _lightUpNextCard();
    paused = true;
    setTimeout(_drainQueue, 1500);
  }

  callReadingAPI(STATE.question, STATE.selectedCards, {
    onChunk(ch) {
      if (firstChunk) {
        firstChunk = false;
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
      }
      if (contentEl) _processChunk(ch);
    },
    onDone() {
      const remaining = sepBuf.replace(new RegExp(CARD_SEP, 'g'), '');
      if (remaining && contentEl) _appendChunkToReading(contentEl, remaining);
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
      STATE.phase = 'done';
      if (restartBtn) {
        restartBtn.style.display = 'block';
        restartBtn.style.opacity = '0';
        setTimeout(() => { restartBtn.style.transition = 'opacity 0.6s ease'; restartBtn.style.opacity = '1'; }, 50);
      }
    },
    onError(err, partial) {
      console.error('reading error:', err);
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) {
        contentEl.style.display = 'block';
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'color:#e57373;font-size:0.82rem;margin-top:12px;padding-top:12px;border-top:1px solid rgba(229,115,115,0.3)';
        errDiv.textContent = partial ? '⚠ 网络中断，以上为已接收内容。请刷新重试。' : '⚠ 解读暂时不可用，请检查网络连接后重试。';
        contentEl.appendChild(errDiv);
      }
      if (restartBtn) restartBtn.style.display = 'block';
    },
  });
}

// ── 逐字追加渲染 ─────────────────────────────────────────────────────────────

let _currentLine   = '';
let _currentLineEl = null;

function _appendChunkToReading(container, text) {
  for (const ch of text) {
    if (!_currentLineEl) {
      _currentLineEl = _newLineEl('');
      container.appendChild(_currentLineEl);
    }
    if (ch === '\n') {
      _applyLineStyle(_currentLineEl, _currentLine);
      _currentLine   = '';
      _currentLineEl = _newLineEl('');
      container.appendChild(_currentLineEl);
    } else {
      _currentLine += ch;
      _currentLineEl.textContent += ch;
      _applyLineStyle(_currentLineEl, _currentLine);
    }
  }
  container.scrollTop = container.scrollHeight;
}

function _newLineEl(text) {
  const el = document.createElement('div');
  el.className   = 'reading-line';
  el.textContent = text;
  return el;
}

function _applyLineStyle(el, text) {
  const isTitle = /^[📌🃏💡⚡★·]/.test(text.trimStart());
  if (isTitle && text.trim().length > 0) el.classList.add('reading-title-line');
  else el.classList.remove('reading-title-line');
}

function _buildRevealedCardsRow(selectedCards) {
  const row = document.getElementById('revealed-cards-row');
  if (!row) return;
  row.innerHTML = '';
  selectedCards.forEach(card => {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-card-thumb', '1');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'thumb-img-wrap';
    imgWrap.style.cssText =
      'width:48px;height:78px;border-radius:4px;overflow:hidden;' +
      'border:1px solid rgba(201,169,110,0.2);box-shadow:0 0 4px 1px rgba(201,169,110,0.08);';

    const img = document.createElement('img');
    img.src     = getCardImagePath(card.card_id);
    img.alt     = card.name || '';
    img.onerror = () => { img.style.display = 'none'; };
    Object.assign(img.style, {
      width: '100%', height: '100%', objectFit: 'cover',
      transform: card.orientation === 'Reversed' ? 'rotate(180deg)' : 'none',
    });
    imgWrap.appendChild(img);

    const posEl = document.createElement('div');
    posEl.textContent = card.position_name || '';
    posEl.style.cssText = 'font-size:0.58rem;color:var(--gold);font-family:var(--font-display);letter-spacing:0.04em;white-space:nowrap;';

    const nameEl = document.createElement('div');
    nameEl.textContent = card.name || '';
    nameEl.style.cssText = 'font-size:0.58rem;color:var(--text-muted);white-space:nowrap;max-width:56px;overflow:hidden;text-overflow:ellipsis;text-align:center;';

    wrap.appendChild(imgWrap); wrap.appendChild(posEl); wrap.appendChild(nameEl);
    row.appendChild(wrap);
  });
}

// ── 重新开始 ─────────────────────────────────────────────────────────────────

function handleRestart() {
  stopSway();
  destroyParticleCanvas();
  clearMouseFallback();

  _currentLine   = '';
  _currentLineEl = null;

  STATE.phase           = 'entry';
  STATE.question        = '';
  STATE.spread          = null;
  STATE.selectedCards   = [];
  STATE.selectionLocked = false;
  STATE.drawCount       = 0;
  STATE.chargeProgress  = 0;
  STATE.hoveredCard     = null;
  STATE.hoveredCardIdx  = null;
  STATE.activated       = false;

  clearQuestionInput();
  hideError('entry-error');

  const hint = document.getElementById('preparing-spread-hint');
  if (hint) { hint.textContent = ''; hint.style.opacity = '0'; }

  const light = document.getElementById('breath-light');
  if (light) { light.classList.remove('burst'); light.style.display = ''; }

  // 归还 carousel-stage 到 selecting 场景
  const stageEl = document.getElementById('carousel-stage');
  const selectingScene = document.getElementById('scene-selecting');
  if (stageEl && selectingScene && stageEl.parentElement !== selectingScene) {
    const gestureHint = selectingScene.querySelector('#gesture-hint');
    if (gestureHint) {
      selectingScene.insertBefore(stageEl, gestureHint);
    } else {
      selectingScene.appendChild(stageEl);
    }
  }

  const area = document.getElementById('card-collect-area');
  if (area) {
    area.innerHTML = '';
    const rev = document.getElementById('scene-revealing');
    if (rev) rev.appendChild(area);
  }

  const contentEl = document.getElementById('reading-content');
  if (contentEl) contentEl.innerHTML = '';

  setPhase('entry');
}

// ── 全局事件绑定 ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('question-input');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStart(); }
    });
    input.addEventListener('focus', () => {
      const light = document.getElementById('breath-light');
      if (light) light.classList.add('focused');
    });
    input.addEventListener('blur', () => {
      const light = document.getElementById('breath-light');
      if (light) light.classList.remove('focused');
    });
  }
});
