/**
 * app.js — Part 2 改造
 *
 * 新增/改动：
 *   - enterSpreading 完成后调用 startSway + initParticleCanvas + bindMouseFallback
 *   - initMediaPipe 在 selecting 阶段启动（摄像头已就绪时）
 *   - handleReset 调用 clearMouseFallback
 *   - handleShowResult → 'revealing' 短暂过渡后再进入 'reading'
 *   - 保留 Part 1 全部逻辑
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

// ── 结果页（revealing → reading） ─────────────────────────────────────────

function handleShowResult() {
  STATE.phase = 'revealing';
  setPhase('revealing');
  stopSway();

  updateCollectArea(STATE.selectedCards);

  setTimeout(() => {
    STATE.phase = 'reading';
    renderResultScene(STATE.question, STATE.selectedCards);
    _fetchReading(STATE.question, STATE.selectedCards);
    setPhase('reading');
  }, 1200);
}

// ── AI 解读（Anthropic Claude API） ───────────────────────────────────────

async function _fetchReading(question, cards) {
  const readingArea = document.getElementById('reading-area');
  if (!readingArea) return;
  readingArea.textContent = '';

  const cardDesc = cards.map((c, i) =>
    `第${i + 1}张【${c.position_name}】：${c.name}（${c.orientation === 'Reversed' ? '逆位' : '正位'}）`
  ).join('\n');

  const systemPrompt = `你是一位经验丰富的塔罗解读师，风格务实清晰，擅长给出可执行的指引。
用户问的是真实问题，需要的是真实答案。

【输出结构】严格按以下四段顺序输出：

第一段：📌 整体概况
2-3句话，说清楚这次牌面的整体能量倾向和核心议题。不要逐张介绍，给一个整体判断。

第二段：🃏 逐张解读
每张牌单独一段，格式：「★位置名 — 牌名 · 正/逆位」作为小标题（大阿卡纳用★）
然后 2-4 句话解读这张牌在当前问题下的具体含义。必须结合用户的问题场景。

第三段：💡 综合判断
2-3句话，整合多张牌之间的关系，给出一个整体趋势结论。

第四段：⚡ 行动建议
给出 2-3 条具体建议，每条格式：「· 【时限】具体行动（说清楚做什么）」
禁止出现：好好休息、保持积极、相信自己、顺其自然、多关注自己。

总字数 350-500 字，信息密度优先。`;

  const userPrompt = `我的问题：${question}\n\n抽到的牌：\n${cardDesc}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 1000,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const text = data.content?.map(b => b.text || '').join('') || '解读暂时不可用，请稍后再试。';

    readingArea.textContent = '';
    let idx = 0;
    function typeNext() {
      if (idx < text.length) {
        readingArea.textContent += text[idx++];
        const ch = text[idx - 1];
        const delay = (ch === '\n' || ch === '。' || ch === '！' || ch === '？') ? 55 : 12;
        setTimeout(typeNext, delay);
      }
    }
    typeNext();

  } catch (err) {
    console.error('reading API error:', err);
    readingArea.textContent = '解读暂时不可用。请检查网络连接或稍后再试。';
  }
}

// ── 重新开始 ───────────────────────────────────────────────────────────────

function handleRestart() {
  stopSway();
  clearMouseFallback();

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
  if (area) area.innerHTML = '';

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
