/**
 * app.js — Phase 8/9/10 完整实现
 *
 * 新增/改动：
 *   Phase 8  — handleShowResult 触发 3D 翻牌动画（flipRevealCards）
 *   Phase 9  — startReading / callReadingAPI 流式输出 / reading 场景 UI
 *   Phase 10 — 场景淡入淡出（setPhase 已改为 opacity 过渡）
 *            — 网络中断时保留已收到内容
 */

// ── 摄像头授权 ─────────────────────────────────────────────────────────────

async function requestCamera() {
  const TIMEOUT = 10_000;
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

  animateBreathOut(() => {
    STATE.phase = 'preparing';
    setPhase('preparing');

    const cameraTask = requestCamera();
    const apiTask    = callPrepareAPI(question);

    Promise.all([cameraTask, apiTask])
      .then(([, data]) => {
        STATE.spread    = data;
        STATE.drawCount = data.draw_count;
        enterSpreading(data);
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

// ── spreading：牌展开动画 ─────────────────────────────────────────────────

function enterSpreading(data) {
  STATE.phase = 'spreading';

  renderSelectingScene(data, STATE.question, _noopCardClick);

  setPhase('spreading');

  const spreadingContainer = document.getElementById('spreading-card-area');
  const tray = document.getElementById('card-tray');
  if (spreadingContainer && tray) spreadingContainer.appendChild(tray);

  const cardEls = Array.from(tray.querySelectorAll('.tarot-card'));
  layoutCards(cardEls, false);

  void tray.offsetHeight;

  animateSpread(cardEls, () => {
    const selectingContainer = document.getElementById('scene-selecting');
    if (selectingContainer && tray) {
      const errorEl = selectingContainer.querySelector('#selecting-error');
      selectingContainer.insertBefore(tray, errorEl);
    }

    STATE.phase = 'selecting';
    setPhase('selecting');

    startSway();
    initParticleCanvas();
    updateGestureHint();
    bindMouseFallback();

    if (STATE.cameraReady) {
      initMediaPipe();
    } else {
      updateGestureHint();
    }
  });
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

  document.querySelectorAll('#card-tray .tarot-card').forEach(el => {
    el.style.opacity = '1';
    el.classList.remove('selected');
    const badge = el.querySelector('.selected-badge');
    if (badge) badge.textContent = '';
  });

  bindMouseFallback();
}

// ── Phase 8：revealing → 翻牌动画 ────────────────────────────────────────

function handleShowResult() {
  STATE.phase = 'revealing';
  setPhase('revealing');
  stopSway();

  // 把收集区搬进 revealing 场景
  const revealScene = document.getElementById('scene-revealing');
  const collectArea = document.getElementById('card-collect-area');
  if (revealScene && collectArea) {
    revealScene.appendChild(collectArea);
  }

  // 短暂等待 DOM 稳定后开始翻牌
  setTimeout(() => {
    flipRevealCards(STATE.selectedCards, () => {
      // 全部翻完后暂停 1s，进入 reading
      setTimeout(() => {
        startReading();
      }, 1000);
    });
  }, 400);
}

/**
 * 依次 3D 翻转收集区里的每张牌槽
 * @param {object[]} selectedCards
 * @param {function} onAllFlipped
 */
function flipRevealCards(selectedCards, onAllFlipped) {
  const collectArea = document.getElementById('card-collect-area');
  if (!collectArea) { if (onAllFlipped) onAllFlipped(); return; }

  const slots = Array.from(collectArea.querySelectorAll('.collect-slot'));
  if (!slots.length) { if (onAllFlipped) onAllFlipped(); return; }

  const FLIP_INTERVAL = 520; // 每张间隔

  slots.forEach((slot, i) => {
    const card = selectedCards[i];
    if (!card) return;

    setTimeout(() => {
      _flipSlot(slot, card);

      // 全屏微震
      document.body.classList.add('screen-shake');
      setTimeout(() => document.body.classList.remove('screen-shake'), 320);

      if (i === slots.length - 1) {
        setTimeout(() => {
          if (onAllFlipped) onAllFlipped();
        }, 600);
      }
    }, i * FLIP_INTERVAL);
  });
}

/**
 * 将单个收集槽改造为 3D 翻转容器并触发翻转
 */
function _flipSlot(slot, cardData) {
  // 避免重复翻
  if (slot.dataset.flipped === '1') return;
  slot.dataset.flipped = '1';

  const isReversed = cardData.orientation === 'Reversed';
  const isMajor    = cardData.card_id < 22;

  // 清空旧内容，重建为 3D 翻转结构
  slot.innerHTML = '';
  Object.assign(slot.style, {
    perspective:     '600px',
    transformStyle:  'preserve-3d',
    position:        'relative',
    cursor:          'default',
    // 放大翻牌槽以便看清牌面
    width:  '72px',
    height: '116px',
  });

  // 翻转内容器
  const inner = document.createElement('div');
  inner.className = 'flip-inner';
  Object.assign(inner.style, {
    position:        'relative',
    width:           '100%',
    height:          '100%',
    transformStyle:  'preserve-3d',
    transition:      'transform 0.55s cubic-bezier(0.4, 0.2, 0.2, 1)',
  });

  // 牌背面（初始朝前）
  const back = document.createElement('div');
  back.className = 'flip-back';
  Object.assign(back.style, {
    position:           'absolute',
    inset:              '0',
    backfaceVisibility: 'hidden',
    borderRadius:       '5px',
    background:         'var(--bg)',
    border:             '1px solid var(--border)',
    display:            'flex',
    alignItems:         'center',
    justifyContent:     'center',
    overflow:           'hidden',
  });
  back.innerHTML = `
    <svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" style="width:70%;opacity:0.5">
      <rect x="4" y="4" width="52" height="92" rx="2" fill="none" stroke="#c9a96e" stroke-width="0.8" opacity="0.4"/>
      <polygon points="30,12 52,50 30,88 8,50" fill="none" stroke="#c9a96e" stroke-width="0.8" opacity="0.4"/>
      <polygon points="30,22 46,50 30,78 14,50" fill="none" stroke="#c9a96e" stroke-width="0.6" opacity="0.3"/>
      <circle cx="30" cy="50" r="2" fill="#c9a96e" opacity="0.4"/>
    </svg>`;

  // 牌正面（初始朝后，旋转180°藏在背后）
  const front = document.createElement('div');
  front.className = 'flip-front';
  Object.assign(front.style, {
    position:           'absolute',
    inset:              '0',
    backfaceVisibility: 'hidden',
    transform:          'rotateY(180deg)',
    borderRadius:       '5px',
    overflow:           'hidden',
    border:             '1px solid rgba(201,169,110,0.6)',
    boxShadow:          '0 0 18px 4px rgba(201,169,110,0.35)',
  });

  const img = document.createElement('img');
  img.src    = getCardImagePath(cardData.card_id);
  img.alt    = cardData.name || '';
  img.onerror = () => { img.style.display = 'none'; };
  Object.assign(img.style, {
    width:        '100%',
    height:       '100%',
    objectFit:    'cover',
    borderRadius: '4px',
    display:      'block',
    transform:    isReversed ? 'rotate(180deg)' : 'none',
  });
  front.appendChild(img);

  inner.appendChild(back);
  inner.appendChild(front);
  slot.appendChild(inner);

  // 位置名标签（牌上方）
  const posLabel = document.createElement('div');
  posLabel.className = 'flip-pos-label';
  posLabel.textContent = cardData.position_name || '';
  Object.assign(posLabel.style, {
    position:   'absolute',
    top:        '-22px',
    left:       '50%',
    transform:  'translateX(-50%)',
    fontSize:   '0.6rem',
    color:      'var(--gold)',
    whiteSpace: 'nowrap',
    opacity:    '0',
    transition: 'opacity 0.4s ease 0.3s',
    fontFamily: 'var(--font-display)',
    letterSpacing: '0.05em',
  });
  slot.appendChild(posLabel);

  // 牌名标签（牌下方，翻完后浮现）
  const nameLabel = document.createElement('div');
  nameLabel.className = 'flip-name-label';
  nameLabel.textContent = (isMajor ? '★ ' : '') + (cardData.name || '');
  Object.assign(nameLabel.style, {
    position:   'absolute',
    bottom:     '-26px',
    left:       '50%',
    transform:  'translateX(-50%)',
    fontSize:   '0.6rem',
    color:      'var(--text)',
    whiteSpace: 'nowrap',
    opacity:    '0',
    transition: 'opacity 0.4s ease 0.5s',
    textAlign:  'center',
    maxWidth:   '96px',
    overflow:   'hidden',
    textOverflow: 'ellipsis',
  });
  slot.appendChild(nameLabel);

  // 触发翻转
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      inner.style.transform = 'rotateY(180deg)';

      // 金色光晕
      slot.style.boxShadow = '0 0 0px 0px rgba(201,169,110,0)';
      setTimeout(() => {
        slot.style.transition = 'box-shadow 0.3s ease';
        slot.style.boxShadow  = '0 0 28px 8px rgba(201,169,110,0.5)';
        setTimeout(() => {
          slot.style.boxShadow = '0 0 8px 2px rgba(201,169,110,0.2)';
        }, 350);
      }, 280);

      // 标签浮现
      setTimeout(() => {
        posLabel.style.opacity  = '1';
        nameLabel.style.opacity = '1';
      }, 400);
    });
  });
}

// ── Phase 9：reading 场景 ────────────────────────────────────────────────

/**
 * 进入 reading 场景，展示翻好的牌图，然后调用 callReadingAPI 流式输出
 */
function startReading() {
  STATE.phase = 'reading';
  renderResultScene(STATE.question, STATE.selectedCards);
  _buildRevealedCardsRow(STATE.selectedCards);
  setPhase('reading');

  // 显示加载态
  const loadingEl = document.getElementById('reading-loading');
  const contentEl = document.getElementById('reading-content');
  if (loadingEl) loadingEl.style.display = 'flex';
  if (contentEl) { contentEl.style.display = 'none'; contentEl.innerHTML = ''; }

  const restartBtn = document.getElementById('restart-btn');
  if (restartBtn) restartBtn.style.display = 'none';

  let partialText = '';
  let firstChunk  = true;

  callReadingAPI(STATE.question, STATE.selectedCards, {
    onChunk(ch) {
      partialText += ch;

      if (firstChunk) {
        firstChunk = false;
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
      }

      if (contentEl) _appendChunkToReading(contentEl, ch);
    },
    onDone(fullText) {
      // 确保内容区可见
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';

      STATE.phase = 'done';
      if (restartBtn) {
        restartBtn.style.display = 'block';
        restartBtn.style.opacity = '0';
        setTimeout(() => {
          restartBtn.style.transition = 'opacity 0.6s ease';
          restartBtn.style.opacity    = '1';
        }, 50);
      }
    },
    onError(err, partial) {
      console.error('reading error:', err);
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) {
        contentEl.style.display = 'block';
        // 保留已有内容，追加错误提示
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'color:#e57373;font-size:0.82rem;margin-top:12px;padding-top:12px;border-top:1px solid rgba(229,115,115,0.3)';
        errDiv.textContent = partial
          ? '⚠ 网络中断，以上为已接收内容。请刷新重试。'
          : '⚠ 解读暂时不可用，请检查网络连接后重试。';
        contentEl.appendChild(errDiv);
      }
      if (restartBtn) restartBtn.style.display = 'block';
    },
  });
}

/** 逐字追加，对分段标题做特殊样式 */
let _currentLine = '';
let _currentLineEl = null;

function _appendChunkToReading(container, ch) {
  if (!_currentLineEl) {
    _currentLineEl = _newLineEl('');
    container.appendChild(_currentLineEl);
  }

  if (ch === '\n') {
    // 换行：结算当前行样式，开新行
    _applyLineStyle(_currentLineEl, _currentLine);
    _currentLine   = '';
    _currentLineEl = _newLineEl('');
    container.appendChild(_currentLineEl);
  } else {
    _currentLine += ch;
    _currentLineEl.textContent += ch;
    // 实时判断是否为标题行（以 emoji 开头）
    _applyLineStyle(_currentLineEl, _currentLine);
  }

  // 平滑滚动到底部
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
  if (isTitle && text.trim().length > 0) {
    el.classList.add('reading-title-line');
  } else {
    el.classList.remove('reading-title-line');
  }
}

/** 在 reading 区顶部构建翻好的牌缩略图行 */
function _buildRevealedCardsRow(selectedCards) {
  const row = document.getElementById('revealed-cards-row');
  if (!row) return;
  row.innerHTML = '';

  selectedCards.forEach(card => {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      display:flex; flex-direction:column; align-items:center; gap:4px;
    `;

    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = `
      width:48px; height:78px; border-radius:4px; overflow:hidden;
      border:1px solid rgba(201,169,110,0.4);
      box-shadow:0 0 8px 2px rgba(201,169,110,0.15);
    `;

    const img = document.createElement('img');
    img.src     = getCardImagePath(card.card_id);
    img.alt     = card.name || '';
    img.onerror = () => { img.style.display = 'none'; };
    Object.assign(img.style, {
      width:     '100%',
      height:    '100%',
      objectFit: 'cover',
      transform: card.orientation === 'Reversed' ? 'rotate(180deg)' : 'none',
    });
    imgWrap.appendChild(img);

    const posEl = document.createElement('div');
    posEl.textContent = card.position_name || '';
    posEl.style.cssText = `
      font-size:0.58rem; color:var(--gold);
      font-family:var(--font-display); letter-spacing:0.04em;
      white-space:nowrap;
    `;

    const nameEl = document.createElement('div');
    nameEl.textContent = card.name || '';
    nameEl.style.cssText = `
      font-size:0.58rem; color:var(--text-muted);
      white-space:nowrap; max-width:56px;
      overflow:hidden; text-overflow:ellipsis; text-align:center;
    `;

    wrap.appendChild(imgWrap);
    wrap.appendChild(posEl);
    wrap.appendChild(nameEl);
    row.appendChild(wrap);
  });
}

// ── 重新开始 ───────────────────────────────────────────────────────────────

function handleRestart() {
  stopSway();
  clearMouseFallback();

  // 重置逐字渲染状态
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

  clearQuestionInput();
  hideError('entry-error');

  const light = document.getElementById('breath-light');
  if (light) { light.classList.remove('burst'); light.style.display = ''; }

  const area = document.getElementById('card-collect-area');
  if (area) {
    area.innerHTML = '';
    // 搬回 revealing 场景
    const rev = document.getElementById('scene-revealing');
    if (rev) rev.appendChild(area);
  }

  const contentEl = document.getElementById('reading-content');
  if (contentEl) contentEl.innerHTML = '';

  setPhase('entry');
}

// ── 全局事件绑定 ───────────────────────────────────────────────────────────

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
