/**
 * api.js — 后端接口层
 *
 * ── 本次新增 ──────────────────────────────────────────────────────────────
 * 新增函数：callReadingAPI(question, cards, { onChunk, onDone, onError })
 *   封装为回调式 API，支持流式输出协议。
 *   当前使用 Mock 逻辑：调用 Anthropic Claude API 生成真实解读。
 *   Mock / 真实 API 通过注释切换，其余文件无需改动。
 */

// ── 牌阵元数据（mock 分支用，不影响真实 API 路径）──────────────────────────

const MOCK_SPREAD_META = {
  spread:      'three_timeline',
  spread_name: '时间轴三牌',
  positions:   ['过去', '现在', '未来'],
  draw_count:  3,
};

// ── 私有工具：从 DECK 随机不放回抽牌 ─────────────────────────────────────

/**
 * 从 DECK 随机不放回抽取 count 张，并附加 position_name。
 * @param {number} count — 抽取张数，须 ≤ 78
 * @returns {object[]}
 */
function _mockDraw(count) {
  const positions = MOCK_SPREAD_META.positions;

  const pool = [...DECK];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count).map((card, idx) => ({
    card_id:       card.id,
    name:          card.name,
    image:         card.image,
    orientation:   Math.random() < 0.5 ? 'Upright' : 'Reversed',
    position_name: positions[idx] ?? `位置${idx + 1}`,
  }));
}

// ── callPrepareAPI ─────────────────────────────────────────────────────────

/**
 * 调用 /api/prepare，返回牌阵+抽牌数据。
 * @param {string} question
 * @returns {Promise<object>}
 */
async function callPrepareAPI(question) {
  /* ── 真实调用（后端就绪后取消注释，删除下方 Mock 逻辑块）────────────────
  const res = await fetch('/api/prepare', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ question }),
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
  ────────────────────────────────────────────────────────────────────────── */

  // ── Mock 逻辑 ─────────────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 400));
  const drawCount = MOCK_SPREAD_META.draw_count;
  return {
    ...MOCK_SPREAD_META,
    cards: _mockDraw(drawCount),
  };
}

// ── callReadingAPI ─────────────────────────────────────────────────────────

/**
 * 调用解读 API，以回调形式流式返回塔罗解读文本。
 *
 * @param {string}   question          — 用户问题
 * @param {object[]} cards             — 已选牌列表（含 name / orientation / position_name）
 * @param {object}   callbacks
 * @param {function} callbacks.onChunk — 每个文字块回调 (text: string) => void
 * @param {function} callbacks.onDone  — 全部完成回调 (fullText: string) => void
 * @param {function} callbacks.onError — 出错回调 (err: Error, partialText: string) => void
 */
async function callReadingAPI(question, cards, { onChunk, onDone, onError } = {}) {

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

  let accumulated = '';

  try {
    /* ── 真实流式调用（后端就绪后取消注释，删除下方 Mock 逻辑块）──────────
    const res = await fetch('/api/reading', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question, cards }),
      signal:  AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      accumulated += chunk;
      if (onChunk) onChunk(chunk);
    }
    if (onDone) onDone(accumulated);
    return;
    ────────────────────────────────────────────────────────────────────── */

    // ── Mock：直接调用 Anthropic Claude API ──────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
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
    const fullText = data.content?.map(b => b.text || '').join('') || '解读暂时不可用，请稍后再试。';

    // 模拟流式打字效果（每字逐发）
    const CHAR_DELAY = (ch) => {
      if (ch === '\n') return 55;
      if ('。！？'.includes(ch)) return 55;
      if ('，、；：'.includes(ch)) return 25;
      return 12;
    };

    let idx = 0;
    function sendNext() {
      if (idx >= fullText.length) {
        if (onDone) onDone(fullText);
        return;
      }
      const ch = fullText[idx++];
      accumulated += ch;
      if (onChunk) onChunk(ch);
      setTimeout(sendNext, CHAR_DELAY(ch));
    }
    sendNext();

  } catch (err) {
    console.error('callReadingAPI error:', err);
    if (onError) onError(err, accumulated);
    else if (onDone) onDone(accumulated || '解读暂时不可用，请检查网络连接后重试。');
  }
}
