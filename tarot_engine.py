"""
tarot_engine.py —— 公平抽牌版

抽牌逻辑与真实物理塔罗牌一致：
  1. 78张牌等概率（无大牌加权、无时段因子、无关键位置权重）
  2. 正逆位 50/50（rng.choice，不受 upright_bias 影响）
  3. 不放回抽样（与实体牌相同）
  4. seed 由 os.urandom(32) 生成，保存后可完整复现同一次抽牌

其余功能保持不变：
  - spreads_config.json 数据驱动
  - get_available_spreads / get_spread_meta 供外部调用
  - position_semantic 随 draw_result 传递
"""

import json, os, random, time, uuid


# ── 常量 ──────────────────────────────────────────────────────────────────────
MAJOR_ARCANA_IDS = set(range(22))


def _make_seed():
    """用 os.urandom 生成种子，保存后可完整复现同一次抽牌。"""
    return int.from_bytes(os.urandom(32), "big")


class TarotEngine:
    def __init__(self, spreads_config_path="spreads_config.json"):
        self.deck = list(range(78))

        if os.path.exists(spreads_config_path):
            with open(spreads_config_path, encoding="utf-8") as f:
                self.spreads = json.load(f)
        else:
            print(f"⚠️  未找到 {spreads_config_path}，使用内置默认牌阵。")
            self.spreads = {
                "three_timeline": {
                    "name": "时间轴三牌",
                    "description": "过去 / 现在 / 未来",
                    "scene_tags": ["general"],
                    "positions": [
                        {"name": "过去", "is_key": False, "semantic": "过去因素"},
                        {"name": "现在", "is_key": True,  "semantic": "当前状态"},
                        {"name": "未来", "is_key": True,  "semantic": "可能走向"},
                    ]
                }
            }

    def get_available_spreads(self, scene_type=None):
        """返回可用牌阵 key 列表，供 Agent 0 路由使用"""
        if scene_type is None:
            return list(self.spreads.keys())
        return [k for k, v in self.spreads.items()
                if scene_type in v.get("scene_tags", [])]

    def get_spread_meta(self, spread_key):
        """返回牌阵元信息，供 main_console 展示"""
        if spread_key not in self.spreads:
            spread_key = "three_timeline"
        meta = self.spreads[spread_key]
        return {
            "key":         spread_key,
            "name":        meta.get("name", spread_key),
            "description": meta.get("description", ""),
            "positions":   [p["name"] for p in meta.get("positions", [])],
        }

    def draw_cards(self, spread_key="three_timeline", question="",
                   seed=None, spread_size=None):
        """
        抽牌主方法。与真实物理塔罗牌行为一致：
          - 78张等概率，不放回
          - 正逆位各 50%
          - seed 保存后可完整复现

        spread_key  : 牌阵类型，对应 spreads_config.json 的 key
        question    : 仅记录，不参与抽牌逻辑
        seed        : 整数种子，指定后可复现；省略则随机生成
        spread_size : 向下兼容旧调用，截取前 N 个位置
        """
        if spread_key not in self.spreads:
            spread_key = "three_timeline"

        positions = self.spreads[spread_key]["positions"]
        if spread_size is not None:
            positions = positions[:spread_size]

        final_seed = _make_seed() if seed is None else seed
        rng  = random.Random(final_seed)
        pool = list(self.deck)
        cards = []

        for i, pos in enumerate(positions):
            picked = rng.choice(pool)                          # 等概率
            pool.remove(picked)
            orientation = rng.choice(["Upright", "Reversed"]) # 50/50
            cards.append({
                "position":          i + 1,
                "position_name":     pos["name"],
                "position_semantic": pos.get("semantic", ""),
                "card_id":           picked,
                "orientation":       orientation,
                "is_major":          picked in MAJOR_ARCANA_IDS,
            })

        return {
            "session_id":  f"tarot_{uuid.uuid4().hex[:8]}",
            "timestamp":   time.time(),
            "seed":        final_seed,   # 整数，可直接传回 draw_cards(seed=...) 复现
            "spread":      spread_key,
            "spread_name": self.spreads[spread_key].get("name", spread_key),
            "question":    question,
            "cards":       cards,
        }