"""
main_console.py —— 重构版

核心改动：
  1. Agent 0 在抽牌前运行，解析意图并路由牌阵
  2. 展示"系统为你选择了 XX 牌阵"，用户可确认或切换
  3. TarotEngine 注入到 AgentPipeline，供 Agent 0 查询可用牌阵
  4. 打印流水线进度时标注五层 Agent 名称
"""

import os
import json
from tarot_engine import TarotEngine
from tarot_rag import TarotRAG
from agent_pipeline import AgentPipeline

# 牌阵中文展示名（与 spreads_config.json 的 key 对应）
SPREAD_DISPLAY = {
    "three_timeline":     "时间轴三牌（过去 / 现在 / 未来）",
    "three_relationship": "关系三牌（你 / 对方 / 关系）",
    "three_options":      "选项三牌（选项A / 选项B / 建议）",
    "single":             "单张指引",
    "five_diamond":       "五牌菱形（核心 / 根源 / 阻力 / 潜力 / 建议）",
    "celtic":             "凯尔特十字（10张，全维度解析）",
}

def start_tarot_session():
    print("🔮 正在连接命运之轮，初始化多智能体占卜系统...")
    try:
        rag    = TarotRAG()
        engine = TarotEngine()
        pipeline = AgentPipeline(rag, engine=engine)   # 注入 engine 供 Agent 0 使用
    except ValueError as e:
        print(str(e))
        return

    print("\n" + "=" * 52)
    print("✨  欢迎来到 RAG + Multi-Agent 智能塔罗系统  ✨")
    print("=" * 52)
    print("本系统配备安全审查 · 意图解析 · 叙事编织 · 反巴纳姆共情机制")
    print("输入 'exit' 或 'quit' 退出仪式\n")

    while True:
        user_input = input("🧙 请写下你心中所求之事：\n> ").strip()

        if not user_input:
            continue
        if user_input.lower() in ["exit", "quit"]:
            print("🕯️  仪式结束，愿星辰指引你的道路。")
            break

        # ── Agent 0：意图解析 + 牌阵路由 ──────────────────────────────────────
        print("\n[Agent 0] 🔍 正在解析你的意图，选择最适合的牌阵...")
        intent = pipeline.parse_intent(user_input)
        spread_key    = intent.get("spread_key", "three_timeline")
        sub_question  = intent.get("sub_question", user_input)
        emotional_tone = intent.get("emotional_tone", "neutral")

        spread_display_name = SPREAD_DISPLAY.get(spread_key, spread_key)
        spread_meta = engine.get_spread_meta(spread_key)

        print(f"\n[Agent 0] 💡 系统为你选择了【{spread_display_name}】")
        print(f"         解读核心：{sub_question}")
        print(f"         位置结构：{'  /  '.join(spread_meta['positions'])}")

        # 可选：让用户切换牌阵
        confirm = input("\n直接回车确认，或输入以下编号切换牌阵：\n"
                        "  [1] 时间轴三牌  [2] 关系三牌  [3] 选项三牌\n"
                        "  [4] 五牌菱形   [5] 凯尔特十字  [6] 单张指引\n> ").strip()
        choice_map = {
            "1": "three_timeline", "2": "three_relationship", "3": "three_options",
            "4": "five_diamond",   "5": "celtic",             "6": "single",
        }
        if confirm in choice_map:
            spread_key = choice_map[confirm]
            spread_meta = engine.get_spread_meta(spread_key)
            print(f"已切换为【{SPREAD_DISPLAY.get(spread_key, spread_key)}】\n")

        # ── 抽牌 ────────────────────────────────────────────────────────────────
        print("[系统] ⏳ 触发密码学安全抽牌引擎...")
        draw_result = engine.draw_cards(spread_key=spread_key, question=user_input)

        print(f"[系统] 🎴 抽牌完成！种子 Seed: {draw_result['seed'][:18]}...")
        print(f"[系统] 🕐 时段因子: {draw_result['time_factor']}  |  牌阵: {draw_result['spread_name']}")
        print("-" * 52)
        print("🃏  【你抽中的牌阵】")
        for card in draw_result["cards"]:
            card_info  = rag.get_card_context(card["card_id"], card["orientation"])
            status_str = "正位" if card["orientation"] == "Upright" else "逆位"
            pos_label  = card.get("position_name", f"位置{card['position']}")
            major_tag  = "★" if card["is_major"] else "  "
            print(f"  {major_tag}【{pos_label}】{card_info.get('name','神秘牌')} · {status_str}"
                  f"  →  {card_info.get('keywords','')}")
        print("-" * 52)

        print("[流水线] 🚀 启动五层 Multi-Agent 链：")
        print("         Agent A（安全审查）→ Agent B（结构推理）")
        print("         → Agent N（叙事编织）→ Agent C（共情解读）")
        print("大模型深度推演中，请稍候...\n")

        response = pipeline.run_pipeline(user_input, draw_result)

        if response["status"] == "BLOCKED":
            print("❌ 【系统安全拦截】")
            print(f"⚠️  {response['message']}\n")

        elif response["status"] == "SUCCESS":
            print("✦ " + "─" * 48 + " ✦")
            print(response["data"])
            print("✦ " + "─" * 48 + " ✦\n")

            # ── 人类反馈环 ────────────────────────────────────────────────────
            current = response["data"]
            while True:
                feedback = input("[追问] 有补充信息或想深度追问？(回车跳过): ").strip()
                if not feedback:
                    break
                print("\n[系统] 🧠 正在基于你的反馈重新推演...\n")
                new_reply = pipeline.process_feedback(current, feedback)
                print("✦ " + "─" * 48 + " ✦")
                print(new_reply)
                print("✦ " + "─" * 48 + " ✦\n")
                current = new_reply

        print("=" * 52 + "\n")


if __name__ == "__main__":
    start_tarot_session()