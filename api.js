/**
 * api.js — 后端接口层
 *
 * 当前使用 mock 数据，后端就绪后只需：
 *   1. 取消 callPrepareAPI() 内真实 fetch 的注释
 *   2. 删除 mock 逻辑块（标注 "── Mock 逻辑" 的区域）
 * 其余文件无需改动。
 *
 * ── 本次变更 ──────────────────────────────────────────────────────────────
 * 改动函数：callPrepareAPI()
 * 改动原因：
 *   原来 mock 返回硬编码的 3 张固定牌；
 *   现在改为从 DECK（state.js 中声明的 78 张）随机不放回抽取，
 *   并为每张牌随机分配正/逆位（各 50%），与真实塔罗抽牌逻辑一致。
 *
 * 新增私有函数：_mockDraw(count)
 *   从 DECK 中随机不放回抽取 count 张，返回带 position_name 的 cards 数组。
 *   仅供 callPrepareAPI mock 分支调用，不对外暴露。
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
 * @returns {object[]}  — cards 数组，每项含 card_id / name / image /
 *                         orientation / position_name
 */
function _mockDraw(count) {
  const positions = MOCK_SPREAD_META.positions;

  // Fisher-Yates 洗牌后取前 count 张，保证不放回
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
    // positions 数组长度与 count 对齐；超出范围时用序号兜底
    position_name: positions[idx] ?? `位置${idx + 1}`,
  }));
}

// ── 接口函数 ───────────────────────────────────────────────────────────────

/**
 * 调用 /api/prepare，返回牌阵+抽牌数据。
 * @param {string} question — 用户输入的问题
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

  // ── Mock 逻辑（删除此块即切换为真实 API）─────────────────────────────────
  await new Promise(r => setTimeout(r, 400));   // 模拟 400ms 网络延迟

  const drawCount = MOCK_SPREAD_META.draw_count;
  return {
    ...MOCK_SPREAD_META,
    cards: _mockDraw(drawCount),
  };
  // ── Mock 逻辑结束 ─────────────────────────────────────────────────────────
}
