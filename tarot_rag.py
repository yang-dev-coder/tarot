"""
tarot_rag.py —— 重构版

Layer 1：单牌精准牌义（含元素、花色、愚人之旅阶段、数字旅程、小牌兜底描述）
Layer 2：静态牌间关系规则（花色密度、大牌密度、元素牌性、愚人之旅关系）
Layer 3：经典二牌组合动态检索

新增修复：
  - 小牌 description 为空时，用花色+数字旅程生成兜底描述（修复 Card_37 等语义弱问题）
  - archetype / thoth_view 字段按需读取，不强制注入（避免 Token 浪费）
"""

import pandas as pd
import os
from itertools import combinations


# ─────────────────────────────────────────────────────────────────────────────
# 静态知识库
# ─────────────────────────────────────────────────────────────────────────────

MAJOR_ARCANA_IDS = set(range(22))

SUIT_MAP = {
    "权杖": set(range(22, 36)),
    "圣杯": set(range(36, 50)),
    "宝剑": set(range(50, 64)),
    "星币": set(range(64, 78)),
}

SUIT_ELEMENT = {"权杖": "火", "圣杯": "水", "宝剑": "风", "星币": "土"}

MAJOR_ELEMENT = {
    0: "风", 1: "风", 2: "水", 3: "土", 4: "火", 5: "土",
    6: "风", 7: "水", 8: "火", 9: "土", 10: "火", 11: "风",
    12: "水", 13: "水", 14: "火", 15: "土", 16: "火", 17: "风",
    18: "水", 19: "火", 20: "火", 21: "土",
}

ELEMENT_AFFINITY = {
    ("火", "火"): ("强化", "双倍火元素——行动力爆棚，但警惕冲动与燃尽"),
    ("水", "水"): ("强化", "双倍水元素——情感深度共鸣，但警惕过度沉溺"),
    ("风", "风"): ("强化", "双倍风元素——思维清晰锐利，但警惕过度分析"),
    ("土", "土"): ("强化", "双倍土元素——物质稳固，但警惕停滞和保守"),
    ("火", "风"): ("相生", "火借风势——行动获得思维加持，推进力强"),
    ("风", "火"): ("相生", "风助火燃——思维激发行动，创意可以落地"),
    ("水", "土"): ("相生", "水润土壤——情感滋养物质根基，感受与现实协调"),
    ("土", "水"): ("相生", "土承水流——稳固的现实容纳情感，有安全感"),
    ("火", "水"): ("相克", "火水相冲——行动力与情感需求对立，需要找到整合点"),
    ("水", "火"): ("相克", "水灭火焰——情感压制了行动冲动，内在冲突消耗能量"),
    ("风", "土"): ("相克", "风土相悖——理性分析与现实落地产生张力，想法难以执行"),
    ("土", "风"): ("相克", "土困风行——物质现实束缚了思维自由，执行拖累了创意"),
    ("火", "土"): ("中性", "火土并存——激情与稳定并存，彼此独立"),
    ("土", "火"): ("中性", "土火并存——现实与行动并行，需有意识协调"),
    ("风", "水"): ("中性", "风水并存——思维与情感各行其道，需刻意整合"),
    ("水", "风"): ("中性", "水风并存——情感与理性同在，内在存在轻微张力"),
}

FOOLS_JOURNEY_STAGE = {
    (0, 2):   "第一幕/觉醒探索（0-2）",
    (3, 7):   "第一幕/建构选择（3-7）",
    (8, 10):  "第二幕/内在力量（8-10）",
    (11, 14): "第二幕/解构放下（11-14）",
    (15, 16): "第三幕/阴影崩塌（15-16）",
    (17, 20): "第三幕/重建觉醒（17-20）",
    (21, 21): "第三幕/圆满完成（21）",
}

NUMBER_STAGE = {
    1: "诞生——纯元素能量的种子，一切起点",
    2: "二元——首次面对选择或二元平衡",
    3: "初果——第一次看到成果，方向初步验证",
    4: "稳定——基础建立，也可能是停滞",
    5: "冲突——每条花色旅程的必经危机与转折",
    6: "恢复——从冲突中恢复，重新找到流动",
    7: "考验——内在评估，被迫面对更深层问题",
    8: "加速——运动加快，势能累积接近顶点",
    9: "临完成——最后考验，成就即将落地",
    10: "过载/终结——旧循环终结，新循环即将开始",
}

# 宫廷牌数字 → 人格描述（11=侍从，12=骑士，13=王后，14=国王）
COURT_STAGE = {
    11: "侍从——元素能量的学习者，好奇、初探、潜力未显",
    12: "骑士——元素能量的行动者，冲劲十足但尚不成熟",
    13: "王后——元素能量的内化者，深谙此道、稳健滋养",
    14: "国王——元素能量的掌控者，成熟、权威、向外施为",
}

CLASSIC_COMBOS = {
    frozenset(["死神", "星星"]):    "死神+星星：黑暗后的曙光——旧我已死，新的希望正在升起",
    frozenset(["高塔", "星星"]):    "高塔+星星：崩塌后的疗愈——突如其来的破坏为真正的重建扫清道路",
    frozenset(["死神", "审判"]):    "死神+审判：双重蜕变——不仅是结束与重生，更是对整个人生方向的重新校准",
    frozenset(["高塔", "太阳"]):    "高塔+太阳：剧痛后的狂喜——崩塌揭露了被遮蔽的光明，因祸得福",
    frozenset(["倒吊人", "世界"]):  "倒吊人+世界：耐心等待终迎圆满——臣服的智慧最终带来了完整",
    frozenset(["恶魔", "力量"]):    "恶魔+力量：阴影的驯化——正在直面内在欲望与恐惧，而非被控制",
    frozenset(["月亮", "太阳"]):    "月亮+太阳：幻觉与真实的拉锯——潜意识迷雾被意识光芒穿透，过程令人不安",
    frozenset(["女祭司", "魔术师"]): "女祭司+魔术师：直觉与行动的博弈——需同时倾听内在与果断行动，关键在时机",
    frozenset(["隐士", "恋人"]):    "隐士+恋人：独处与连接的矛盾——需先完成自我探索，才能真正投入关系",
    frozenset(["战车", "节制"]):    "战车+节制：冲锋与节制的张力——全速前进的冲动需要被耐心与平衡调和",
    frozenset(["皇帝", "命运之轮"]): "皇帝+命运之轮：秩序遇上变数——建立的结构正被更大力量测试，适应力比控制力重要",
    frozenset(["教皇", "愚者"]):    "教皇+愚者：传统与叛逆的碰撞——在理解规则之后有意识地超越",
    frozenset(["正义", "命运之轮"]): "正义+命运之轮：因果与时机——过去的选择正在产生后果，时机决定以什么形式呈现",
    frozenset(["女皇", "皇帝"]):    "女皇+皇帝：阴阳合一——创造力与结构、滋养与纪律的完美平衡",
    frozenset(["高塔", "恶魔"]):    "高塔+恶魔（预警）：双重警示——不健康的模式束缚你，突然的崩塌是打破枷锁的唯一方式",
    frozenset(["月亮", "宝剑三"]):  "月亮+宝剑三（预警）：恐惧放大了痛苦——悲伤可能被潜意识幻觉所夸大",
    frozenset(["恶魔", "宝剑九"]):  "恶魔+宝剑九（预警）：焦虑的根源是执念——噩梦与恐惧来自不愿放下的依附",
    frozenset(["高塔", "宝剑十"]):  "高塔+宝剑十（预警）：彻底的终结——旧体系全面崩溃，从零开始，轻装上阵",
}

# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────────────────

def _get_card_element(card_id, element_from_csv):
    if card_id in MAJOR_ARCANA_IDS:
        return MAJOR_ELEMENT.get(card_id, element_from_csv)
    return element_from_csv

def _get_suit(card_id):
    for suit, ids in SUIT_MAP.items():
        if card_id in ids:
            return suit
    return None

def _get_pip_number(card_id):
    if card_id in MAJOR_ARCANA_IDS:
        return None
    offset = (card_id - 22) % 14
    return offset + 1  # 1=Ace ... 14=King

def _get_major_stage(card_id):
    if card_id not in MAJOR_ARCANA_IDS:
        return None
    for (start, end), stage in FOOLS_JOURNEY_STAGE.items():
        if start <= card_id <= end:
            return stage
    return None


# ─────────────────────────────────────────────────────────────────────────────
# TarotRAG 主类
# ─────────────────────────────────────────────────────────────────────────────

class TarotRAG:
    def __init__(self, csv_path="tarot_cards.csv"):
        # 支持新旧两个文件名
        if not os.path.exists(csv_path):
            alt = "local_tarot_knowledge.csv"
            if os.path.exists(alt):
                csv_path = alt
        try:
            self.df = pd.read_csv(csv_path, encoding="utf-8-sig") if os.path.exists(csv_path) else pd.DataFrame()
        except Exception as e:
            print(f"⚠️ 塔罗知识库加载失败: {e}，将使用空库运行。")
            self.df = pd.DataFrame()

    # ── Layer 1：单牌精准牌义 ─────────────────────────────────────────────────
    def get_card_context(self, card_id, orientation):
        """
        查询单牌信息，包含：
        - CSV 基础字段（name/element/keywords/description）
        - 元素归属（大牌用 MAJOR_ELEMENT 覆盖）
        - 花色 / 愚人之旅阶段 / 数字旅程（小牌用 NUMBER_STAGE / COURT_STAGE）
        - description 为空时自动生成兜底描述（修复小牌语义弱问题）
        """
        base = {
            "card_id":     card_id,
            "name":        f"Card_{card_id}",
            "element":     "Unknown",
            "keywords":    "",
            "description": "",
            "is_major":    card_id in MAJOR_ARCANA_IDS,
        }

        if not self.df.empty:
            try:
                match = self.df[
                    (self.df["card_id"].astype(str) == str(card_id)) &
                    (self.df["orientation"] == orientation)
                ]
                if not match.empty:
                    row = match.iloc[0]
                    base.update({
                        "name":        row.get("name", base["name"]),
                        "element":     row.get("element", base["element"]),
                        "keywords":    row.get("keywords", ""),
                        "description": row.get("description", ""),
                    })
                    # archetype / thoth_view：有字段才附加，不强制
                    if "archetype" in row and pd.notna(row["archetype"]):
                        base["archetype"] = row["archetype"]
                    if "thoth_view" in row and pd.notna(row["thoth_view"]) and orientation == "Upright":
                        base["thoth_view"] = row["thoth_view"]
            except Exception:
                pass

        # 元素覆盖（大阿卡纳用静态表）
        base["element"] = _get_card_element(card_id, base["element"])

        # 结构性附加信息
        suit      = _get_suit(card_id)
        pip_num   = _get_pip_number(card_id)
        maj_stage = _get_major_stage(card_id)

        if maj_stage:
            base["journey_stage"] = maj_stage
        if suit:
            base["suit"] = suit
        if pip_num:
            if pip_num <= 10:
                base["pip_stage"] = f"{suit}{pip_num}：{NUMBER_STAGE[pip_num]}"
            else:
                base["court_role"] = f"{suit}{COURT_STAGE[pip_num]}"

        # ── 兜底描述（修复 description 为空的小牌）────────────────────────────
        if not base["description"].strip():
            element = base["element"]
            if suit and pip_num:
                if pip_num <= 10:
                    stage_desc = NUMBER_STAGE.get(pip_num, "")
                    base["description"] = (
                        f"{suit}{pip_num}代表{element}元素在「{stage_desc}」阶段的能量显化。"
                        f"在{suit}花色的旅程中，这是{stage_desc.split('——')[0]}的关键节点，"
                        f"{element}元素的力量在此以{'积极推进' if orientation == 'Upright' else '内缩受阻'}的方式呈现。"
                    )
                else:
                    court_desc = COURT_STAGE.get(pip_num, "")
                    base["description"] = (
                        f"{suit}宫廷牌——{court_desc}。"
                        f"{'正位时' if orientation == 'Upright' else '逆位时'}，"
                        f"这种{element}元素的人格能量{'稳定对外施为' if orientation == 'Upright' else '向内收缩或失衡'}。"
                    )

        return base

    # ── Layer 2：牌阵结构性分析 ───────────────────────────────────────────────
    def get_spread_analysis(self, cards):
        """
        输入 draw_result['cards']，返回整个牌阵的结构性分析：
        - 大牌密度、花色集中度、缺席花色
        - 元素牌性（相邻牌对）
        - 愚人之旅（大牌间旅程关系）
        - 经典二牌组合（Layer 3）
        - 叙事冲突检测（新增：相邻牌的能量剧烈反转）
        """
        analysis = {}
        card_ids = [c["card_id"] for c in cards]
        n = len(card_ids)

        # ── 大牌密度 ──────────────────────────────────────────────────────────
        major_count = sum(1 for cid in card_ids if cid in MAJOR_ARCANA_IDS)
        major_ratio = major_count / n if n > 0 else 0
        if major_ratio > 0.5:
            analysis["major_density"] = (
                f"大阿卡纳占比 {major_ratio:.0%}——命运级力量介入，"
                f"问卜者正处于人生重大转折点，外力影响超过个人选择"
            )
        elif major_ratio >= 0.3:
            analysis["major_density"] = f"大阿卡纳占比 {major_ratio:.0%}——命运与个人选择交织，标准解读"
        elif major_ratio > 0:
            analysis["major_density"] = f"大阿卡纳占比 {major_ratio:.0%}——日常选择主导，关注细节与习惯"
        else:
            analysis["major_density"] = "全小阿卡纳——此议题完全在问卜者掌控范围内，不存在命中注定因素"

        # ── 花色密度 ──────────────────────────────────────────────────────────
        suit_counts = {s: 0 for s in SUIT_MAP}
        for cid in card_ids:
            for suit, ids in SUIT_MAP.items():
                if cid in ids:
                    suit_counts[suit] += 1

        suit_meanings = {
            "权杖": "问题核心在行动力与激情，需聚焦而非分散",
            "圣杯": "问题核心在情感与关系，此刻倾听内心比理性分析更重要",
            "宝剑": "问题核心在思维与冲突，可能过度思考，需从头脑回到身体",
            "星币": "问题核心在物质与财务，脚踏实地比幻想更重要",
        }
        missing_meanings = {
            "权杖": "行动力被搁置",
            "圣杯": "情感层面被压抑",
            "宝剑": "思维层面被回避",
            "星币": "物质现实被忽视",
        }
        dominant = [s for s, cnt in suit_counts.items() if cnt >= 3]
        missing  = [s for s, cnt in suit_counts.items() if cnt == 0]
        if dominant:
            analysis["suit_concentration"] = "花色集中：" + "；".join(
                f"{s}×{suit_counts[s]}（{suit_meanings[s]}）" for s in dominant
            )
        if missing:
            analysis["missing_suits"] = "缺席花色（能量被压抑的领域）：" + "、".join(
                f"{s}（{missing_meanings[s]}）" for s in missing
            )

        # ── 元素牌性（相邻牌对）──────────────────────────────────────────────
        if n >= 2:
            dignities = []
            for i in range(n - 1):
                c1, c2 = cards[i], cards[i + 1]
                e1 = _get_card_element(c1["card_id"], self._get_element_from_csv(c1["card_id"]))
                e2 = _get_card_element(c2["card_id"], self._get_element_from_csv(c2["card_id"]))
                key = (e1, e2)
                if key in ELEMENT_AFFINITY:
                    affinity_type, desc = ELEMENT_AFFINITY[key]
                    pos1 = cards[i].get("position_name", f"位置{i+1}")
                    pos2 = cards[i+1].get("position_name", f"位置{i+2}")
                    dignities.append(f"【{pos1}({e1})→{pos2}({e2})】{affinity_type}：{desc}")
            if dignities:
                analysis["elemental_dignities"] = dignities

        # ── 愚人之旅 ──────────────────────────────────────────────────────────
        major_cards = [(c, _get_major_stage(c["card_id"])) for c in cards
                       if c["card_id"] in MAJOR_ARCANA_IDS]
        if len(major_cards) >= 2:
            journey_notes = []
            for i in range(len(major_cards) - 1):
                c1, s1 = major_cards[i]
                c2, s2 = major_cards[i + 1]
                id1, id2 = c1["card_id"], c2["card_id"]
                name1 = self._get_name_from_csv(id1)
                name2 = self._get_name_from_csv(id2)
                pos1  = c1.get("position_name", "")
                pos2  = c2.get("position_name", "")
                if id1 < id2:
                    journey_notes.append(
                        f"{name1}({pos1})→{name2}({pos2})：顺流，{s1}推进到{s2}，灵魂课题自然演进"
                    )
                elif id1 > id2:
                    journey_notes.append(
                        f"{name1}({pos1})→{name2}({pos2})：回溯，从{s1}退回{s2}，可能有未完成课题"
                    )
                else:
                    journey_notes.append(
                        f"{name1}({pos1})与{name2}({pos2})同阶段聚集于{s1}，深度浸泡在此主题中"
                    )
            if journey_notes:
                analysis["fools_journey"] = journey_notes

        # ── 经典二牌组合（Layer 3）───────────────────────────────────────────
        card_names   = [self._get_name_from_csv(c["card_id"]) for c in cards]
        short_names  = [n.split(" ")[0] if n else "" for n in card_names]
        matched = []
        for a, b in combinations(short_names, 2):
            key = frozenset([a, b])
            if key in CLASSIC_COMBOS:
                matched.append(CLASSIC_COMBOS[key])
        if matched:
            analysis["classic_combinations"] = matched

        # ── 叙事冲突检测（新增）──────────────────────────────────────────────
        # 检测相邻牌的能量剧烈反转（大牌正→负 / 负→正），为 Agent N 提供叙事张力线索
        POSITIVE_MAJORS = {0, 1, 3, 6, 8, 10, 14, 17, 19, 20, 21}   # 通常正面能量的大牌
        NEGATIVE_MAJORS = {13, 15, 16, 18, 12}                        # 通常挑战性能量的大牌
        if n >= 2:
            conflicts = []
            for i in range(n - 1):
                id1 = cards[i]["card_id"]
                id2 = cards[i + 1]["card_id"]
                pos1 = cards[i].get("position_name", f"位置{i+1}")
                pos2 = cards[i + 1].get("position_name", f"位置{i+2}")
                n1_pos = id1 in POSITIVE_MAJORS
                n1_neg = id1 in NEGATIVE_MAJORS
                n2_pos = id2 in POSITIVE_MAJORS
                n2_neg = id2 in NEGATIVE_MAJORS
                if n1_pos and n2_neg:
                    conflicts.append(f"【{pos1}→{pos2}】正面→挑战性突转：曾经的光明反衬当前的张力，可能是建立在不稳固基础上的成功")
                elif n1_neg and n2_pos:
                    conflicts.append(f"【{pos1}→{pos2}】挑战→正面突转：黎明前的黑暗，当前的困境正在为真正的疗愈铺路")
            if conflicts:
                analysis["narrative_conflicts"] = conflicts

        return analysis

    # ── 辅助方法 ──────────────────────────────────────────────────────────────
    def _get_element_from_csv(self, card_id):
        if self.df.empty:
            return "Unknown"
        try:
            match = self.df[
                (self.df["card_id"].astype(str) == str(card_id)) &
                (self.df["orientation"] == "Upright")
            ]
            if not match.empty:
                return match.iloc[0]["element"]
        except Exception:
            pass
        return "Unknown"

    def _get_name_from_csv(self, card_id):
        if self.df.empty:
            return f"Card_{card_id}"
        try:
            match = self.df[
                (self.df["card_id"].astype(str) == str(card_id)) &
                (self.df["orientation"] == "Upright")
            ]
            if not match.empty:
                return match.iloc[0]["name"]
        except Exception:
            pass
        return f"Card_{card_id}"