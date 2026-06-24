"""
tarot_engine.py —— 重构版

核心改动：
  1. 牌阵从硬编码 SPREADS 字典迁移到外部 spreads_config.json（数据驱动）
  2. 新增 get_available_spreads(scene_type) 供 Agent 0 路由使用
  3. 新增 get_spread_meta(spread_key) 供 main_console 展示牌阵信息
  4. position_semantic 字段随 draw_result 传递，供 Agent B 使用
  5. 其余逻辑（加权/时段因子/正逆位概率）保持不变
"""

import hashlib, json, os, random, time, uuid
from datetime import datetime


# ── 常量 ──────────────────────────────────────────────────────────────────────
MAJOR_ARCANA_IDS = set(range(22))

ELEMENT_GROUPS = {
    "火": set(range(22, 36)),
    "水": set(range(36, 50)),
    "风": set(range(50, 64)),
    "土": set(range(64, 78)),
}

TIME_BOOSTS = {
    "morning":   {"火", "风"},
    "afternoon": {"水", "土"},
    "night":     {"major"},
}


def _get_time_factor(hour=None):
    h = datetime.now().hour if hour is None else hour
    if 6 <= h < 12:
        return "morning"
    elif h < 18:
        return "afternoon"
    else:
        return "night"


def _card_weight(card_id, is_key, boosted):
    is_major = card_id in MAJOR_ARCANA_IDS
    base = (56 / 22) * 0.84 if is_major else 1.0
    if is_major and is_key:
        base *= 1.2
    hit = False
    if "major" in boosted and is_major:
        hit = True
    else:
        for elem, ids in ELEMENT_GROUPS.items():
            if elem in boosted and card_id in ids:
                hit = True
                break
    return base * (1.08 if hit else 1.0)


def _make_seed(question=""):
    data = os.urandom(32) + str(time.time_ns()).encode() + question.encode()
    return int(hashlib.sha256(data).hexdigest()[:16], 16)


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
                        {"name": "过去", "is_key": False, "upright_bias": 0.60, "semantic": "过去因素"},
                        {"name": "现在", "is_key": True,  "upright_bias": 0.70, "semantic": "当前状态"},
                        {"name": "未来", "is_key": True,  "upright_bias": 0.65, "semantic": "可能走向"},
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
                   seed=None, hour=None, spread_size=None):
        """
        抽牌主方法。
        spread_key  : 牌阵类型，对应 spreads_config.json 的 key
        question    : 用户问题，参与种子生成
        seed        : 指定种子可复现
        hour        : 覆盖当前小时（测试用）
        spread_size : 向下兼容旧调用，不推荐使用
        """
        if spread_key not in self.spreads:
            spread_key = "three_timeline"

        positions = self.spreads[spread_key]["positions"]
        if spread_size is not None:
            positions = positions[:spread_size]

        final_seed  = _make_seed(question) if seed is None else seed
        time_factor = _get_time_factor(hour)
        boosted     = TIME_BOOSTS[time_factor]

        rng  = random.Random(final_seed)
        pool = list(self.deck)
        cards = []

        for i, pos in enumerate(positions):
            weights = [_card_weight(cid, pos["is_key"], boosted) for cid in pool]
            picked  = rng.choices(pool, weights=weights, k=1)[0]
            pool.remove(picked)
            orientation = "Upright" if rng.random() < pos["upright_bias"] else "Reversed"
            cards.append({
                "position":           i + 1,
                "position_name":      pos["name"],
                "position_semantic":  pos.get("semantic", ""),
                "card_id":            picked,
                "orientation":        orientation,
                "is_major":           picked in MAJOR_ARCANA_IDS,
            })

        return {
            "session_id":  f"tarot_{uuid.uuid4().hex[:8]}",
            "timestamp":   time.time(),
            "seed":        hex(final_seed),
            "spread":      spread_key,
            "spread_name": self.spreads[spread_key].get("name", spread_key),
            "time_factor": time_factor,
            "question":    question,
            "cards":       cards,
        }