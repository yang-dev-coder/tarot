/**
 * state.js — 全局状态（单一数据源）
 *
 * phase 枚举（已扩展至 7 个）：
 *   'entry'      — 输入问题
 *   'preparing'  — 调用 /api/prepare 中 + 摄像头授权
 *   'spreading'  — 牌从中心展开到扇形（动画过渡）
 *   'selecting'  — 手势 / 鼠标选牌
 *   'revealing'  — 选中牌翻牌动画
 *   'reading'    — AI 解读流式输出
 *   'done'       — 解读完成
 */

// ── 78 张牌基础数据表 ─────────────────────────────────────────────────────

const DECK = [
  // ── 大阿卡纳（0-21）
  { id:  0, name: '愚者',     image: 'assets/cards/ar00.jpg' },
  { id:  1, name: '魔术师',   image: 'assets/cards/ar01.jpg' },
  { id:  2, name: '女祭司',   image: 'assets/cards/ar02.jpg' },
  { id:  3, name: '女皇',     image: 'assets/cards/ar03.jpg' },
  { id:  4, name: '皇帝',     image: 'assets/cards/ar04.jpg' },
  { id:  5, name: '教皇',     image: 'assets/cards/ar05.jpg' },
  { id:  6, name: '恋人',     image: 'assets/cards/ar06.jpg' },
  { id:  7, name: '战车',     image: 'assets/cards/ar07.jpg' },
  { id:  8, name: '力量',     image: 'assets/cards/ar08.jpg' },
  { id:  9, name: '隐士',     image: 'assets/cards/ar09.jpg' },
  { id: 10, name: '命运之轮', image: 'assets/cards/ar10.jpg' },
  { id: 11, name: '正义',     image: 'assets/cards/ar11.jpg' },
  { id: 12, name: '倒吊人',   image: 'assets/cards/ar12.jpg' },
  { id: 13, name: '死神',     image: 'assets/cards/ar13.jpg' },
  { id: 14, name: '节制',     image: 'assets/cards/ar14.jpg' },
  { id: 15, name: '恶魔',     image: 'assets/cards/ar15.jpg' },
  { id: 16, name: '高塔',     image: 'assets/cards/ar16.jpg' },
  { id: 17, name: '星星',     image: 'assets/cards/ar17.jpg' },
  { id: 18, name: '月亮',     image: 'assets/cards/ar18.jpg' },
  { id: 19, name: '太阳',     image: 'assets/cards/ar19.jpg' },
  { id: 20, name: '审判',     image: 'assets/cards/ar20.jpg' },
  { id: 21, name: '世界',     image: 'assets/cards/ar21.jpg' },

  // ── 权杖（22-35）
  { id: 22, name: '权杖 Ace', image: 'assets/cards/waac.jpg' },
  { id: 23, name: '权杖二',   image: 'assets/cards/wa02.jpg' },
  { id: 24, name: '权杖三',   image: 'assets/cards/wa03.jpg' },
  { id: 25, name: '权杖四',   image: 'assets/cards/wa04.jpg' },
  { id: 26, name: '权杖五',   image: 'assets/cards/wa05.jpg' },
  { id: 27, name: '权杖六',   image: 'assets/cards/wa06.jpg' },
  { id: 28, name: '权杖七',   image: 'assets/cards/wa07.jpg' },
  { id: 29, name: '权杖八',   image: 'assets/cards/wa08.jpg' },
  { id: 30, name: '权杖九',   image: 'assets/cards/wa09.jpg' },
  { id: 31, name: '权杖十',   image: 'assets/cards/wa10.jpg' },
  { id: 32, name: '权杖侍从', image: 'assets/cards/wapa.jpg' },
  { id: 33, name: '权杖骑士', image: 'assets/cards/wakn.jpg' },
  { id: 34, name: '权杖王后', image: 'assets/cards/waqu.jpg' },
  { id: 35, name: '权杖国王', image: 'assets/cards/waki.jpg' },

  // ── 圣杯（36-49）
  { id: 36, name: '圣杯 Ace', image: 'assets/cards/cuac.jpg' },
  { id: 37, name: '圣杯二',   image: 'assets/cards/cu02.jpg' },
  { id: 38, name: '圣杯三',   image: 'assets/cards/cu03.jpg' },
  { id: 39, name: '圣杯四',   image: 'assets/cards/cu04.jpg' },
  { id: 40, name: '圣杯五',   image: 'assets/cards/cu05.jpg' },
  { id: 41, name: '圣杯六',   image: 'assets/cards/cu06.jpg' },
  { id: 42, name: '圣杯七',   image: 'assets/cards/cu07.jpg' },
  { id: 43, name: '圣杯八',   image: 'assets/cards/cu08.jpg' },
  { id: 44, name: '圣杯九',   image: 'assets/cards/cu09.jpg' },
  { id: 45, name: '圣杯十',   image: 'assets/cards/cu10.jpg' },
  { id: 46, name: '圣杯侍从', image: 'assets/cards/cupa.jpg' },
  { id: 47, name: '圣杯骑士', image: 'assets/cards/cukn.jpg' },
  { id: 48, name: '圣杯王后', image: 'assets/cards/cuqu.jpg' },
  { id: 49, name: '圣杯国王', image: 'assets/cards/cuki.jpg' },

  // ── 宝剑（50-63）
  { id: 50, name: '宝剑 Ace', image: 'assets/cards/swac.jpg' },
  { id: 51, name: '宝剑二',   image: 'assets/cards/sw02.jpg' },
  { id: 52, name: '宝剑三',   image: 'assets/cards/sw03.jpg' },
  { id: 53, name: '宝剑四',   image: 'assets/cards/sw04.jpg' },
  { id: 54, name: '宝剑五',   image: 'assets/cards/sw05.jpg' },
  { id: 55, name: '宝剑六',   image: 'assets/cards/sw06.jpg' },
  { id: 56, name: '宝剑七',   image: 'assets/cards/sw07.jpg' },
  { id: 57, name: '宝剑八',   image: 'assets/cards/sw08.jpg' },
  { id: 58, name: '宝剑九',   image: 'assets/cards/sw09.jpg' },
  { id: 59, name: '宝剑十',   image: 'assets/cards/sw10.jpg' },
  { id: 60, name: '宝剑侍从', image: 'assets/cards/swpa.jpg' },
  { id: 61, name: '宝剑骑士', image: 'assets/cards/swkn.jpg' },
  { id: 62, name: '宝剑王后', image: 'assets/cards/swqu.jpg' },
  { id: 63, name: '宝剑国王', image: 'assets/cards/swki.jpg' },

  // ── 星币（64-77）
  { id: 64, name: '星币 Ace', image: 'assets/cards/peac.jpg' },
  { id: 65, name: '星币二',   image: 'assets/cards/pe02.jpg' },
  { id: 66, name: '星币三',   image: 'assets/cards/pe03.jpg' },
  { id: 67, name: '星币四',   image: 'assets/cards/pe04.jpg' },
  { id: 68, name: '星币五',   image: 'assets/cards/pe05.jpg' },
  { id: 69, name: '星币六',   image: 'assets/cards/pe06.jpg' },
  { id: 70, name: '星币七',   image: 'assets/cards/pe07.jpg' },
  { id: 71, name: '星币八',   image: 'assets/cards/pe08.jpg' },
  { id: 72, name: '星币九',   image: 'assets/cards/pe09.jpg' },
  { id: 73, name: '星币十',   image: 'assets/cards/pe10.jpg' },
  { id: 74, name: '星币侍从', image: 'assets/cards/pepa.jpg' },
  { id: 75, name: '星币骑士', image: 'assets/cards/pekn.jpg' },
  { id: 76, name: '星币王后', image: 'assets/cards/pequ.jpg' },
  { id: 77, name: '星币国王', image: 'assets/cards/peki.jpg' },
];

// ── 全局状态 ───────────────────────────────────────────────────────────────

const STATE = {
  /** @type {'entry'|'preparing'|'spreading'|'selecting'|'revealing'|'reading'|'done'} */
  phase:           'entry',

  /** @type {string} 用户输入的问题 */
  question:        '',

  /**
   * /api/prepare 返回的牌阵数据
   * @type {{spread:string, spread_name:string, positions:string[],
   *          draw_count:number, cards:object[]}|null}
   */
  spread:          null,

  /**
   * 用户已点击选中的牌列表
   * 每项结构：{ card_id, orientation, position_name, name, order }
   * @type {object[]}
   */
  selectedCards:   [],

  // ── 新增字段 ──────────────────────────────────────────────────────────────
  /** 需要选的总数（来自 spread.draw_count） */
  drawCount:       0,

  /** 摄像头 / MediaPipe 手势是否可用 */
  gestureEnabled:  false,

  /** 蓄力进度 0~100（手势悬停选牌用） */
  chargeProgress:  0,

  /** 当前手势悬停的牌 DOM 元素 */
  hoveredCard:     null,

  /** 当前手势悬停的牌索引 */
  hoveredCardIdx:  null,

  /** 摄像头是否已就绪 */
  cameraReady:     false,

  /** 选满锁定，防止跳转期间误操作 */
  selectionLocked: false,
};
