"""
server.py —— 塔罗项目 Flask 后端

功能：
  A. 静态文件服务（index.html / js / css / assets）
  B. POST /api/prepare  — 意图解析 + 抽牌
  C. POST /api/reading  — 流式 AI 解读
  D. 全局单例初始化（RAG / Engine / Pipeline）
  E. 同源访问，无需 CORS

启动：python server.py  →  http://localhost:5000
"""

import os
import sys
import io
import concurrent.futures

# Windows 控制台默认 GBK 编码，agent_pipeline 抛出的异常含 emoji（⚠️），
# 不处理会导致 print 时 UnicodeEncodeError 崩溃。强制 stdout/stderr 用 UTF-8。
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# 确保项目目录在 sys.path 中，以便 import 本地模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ── 加载 .env 文件（无需 python-dotenv 依赖）─────────────────────────────────
# 注：变量名不加下划线前缀，它们只是普通的模块顶层局部变量，
#     Python 不存在真正的"模块私有"，下划线前缀此处无意义且有误导性。
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as env_file:
        for env_line in env_file:
            env_line = env_line.strip()
            if env_line and not env_line.startswith("#") and "=" in env_line:
                env_key, _, env_val = env_line.partition("=")
                os.environ.setdefault(env_key.strip(), env_val.strip())

from flask import Flask, request, jsonify, Response, send_from_directory

# ─── 卡牌映射表 ──────────────────────────────────────────────────────────────

# 大阿尔卡纳牌名（id 0-21），与 state.js DECK 完全一致
_MAJOR_NAMES = [
    "愚者", "魔术师", "女祭司", "女皇", "皇帝", "教皇", "恋人",
    "战车", "力量", "隐士", "命运之轮", "正义", "倒吊人", "死神",
    "节制", "恶魔", "高塔", "星星", "月亮", "太阳", "审判", "世界",
]

# 小阿尔卡纳花色中文名
_SUIT_NAMES = ["权杖", "圣杯", "宝剑", "星币"]

# 小阿尔卡纳 rank → 中文名（rank 1=Ace ... 14=国王）
_RANK_NAMES = {
    1: "Ace", 2: "二", 3: "三", 4: "四", 5: "五",
    6: "六", 7: "七", 8: "八", 9: "九", 10: "十",
    11: "侍从", 12: "骑士", 13: "王后", 14: "国王",
}


def _card_name(card_id):
    """根据 card_id 构造牌名，与 state.js DECK 数组完全一致。"""
    if not 0 <= card_id <= 77:
        return f"Card_{card_id}"
    if card_id <= 21:
        return _MAJOR_NAMES[card_id]
    offset = card_id - 22
    suit = _SUIT_NAMES[offset // 14]
    rank = offset % 14 + 1   # 1=Ace ... 14=国王
    return f"{suit} {_RANK_NAMES[rank]}" if rank == 1 else f"{suit}{_RANK_NAMES[rank]}"


def _card_image(card_id):
    """根据 card_id 构造图片路径，与 state.js DECK 数组保持一致。
    card_id 范围 0-77，超出范围返回空字符串。
    """
    if not 0 <= card_id <= 77:
        return ""
    if card_id <= 21:
        # 大阿尔卡纳 ar00.jpg ~ ar21.jpg
        return f"assets/cards/ar{card_id:02d}.jpg"
    offset = card_id - 22
    suit_idx = offset // 14   # 0=权杖 1=圣杯 2=宝剑 3=星币
    rank = offset % 14        # 0=Ace 1-9=2-10 10=侍从 11=骑士 12=王后 13=国王
    prefix = ["wa", "cu", "sw", "pe"][suit_idx]
    if rank == 0:
        return f"assets/cards/{prefix}ac.jpg"
    elif rank <= 9:
        return f"assets/cards/{prefix}{rank + 1:02d}.jpg"
    else:
        court = ["pa", "kn", "qu", "ki"][rank - 10]
        return f"assets/cards/{prefix}{court}.jpg"


def _build_card_map():
    """构建 card_id → {name, image} 映射表，与 state.js DECK 完全一致。"""
    return {
        cid: {"name": _card_name(cid), "image": _card_image(cid)}
        for cid in range(78)
    }


CARD_MAP = _build_card_map()

# ─── 全局单例初始化 ──────────────────────────────────────────────────────────

PIPELINE   = None
ENGINE     = None
RAG        = None
INIT_ERROR = None

try:
    from tarot_rag      import TarotRAG
    from tarot_engine   import TarotEngine
    from agent_pipeline import AgentPipeline

    RAG      = TarotRAG()
    ENGINE   = TarotEngine()
    PIPELINE = AgentPipeline(RAG, engine=ENGINE)
    print("[OK] RAG / Engine / Pipeline initialized")
except Exception as e:
    INIT_ERROR = str(e)
    print(f"[ERROR] backend init failed: {e}")


# ─── Flask 应用 ──────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder=None)


# ── A. 静态文件服务 ──────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(".", path)


# ── B. POST /api/prepare ─────────────────────────────────────────────────────

@app.route("/api/prepare", methods=["POST"])
def api_prepare():
    data = request.get_json(force=True, silent=True) or {}
    question = data.get("question", "")

    # 意图解析：有 Pipeline 时走 LLM，没有时回退默认牌阵
    # 用 ThreadPoolExecutor 加 25s 超时：GLM-4 偶发慢响应时不卡死整个请求，
    # 降级后前端仍能在 45s 总超时内收到响应。
    spread_key = "three_timeline"
    if PIPELINE is not None:
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                future = ex.submit(PIPELINE.parse_intent, question)
                intent = future.result(timeout=25)
            spread_key = intent.get("spread_key", "three_timeline")
        except concurrent.futures.TimeoutError:
            print("[WARN] parse_intent 超时（>25s），降级为默认牌阵 three_timeline")
        except Exception:
            pass  # 其他 LLM 异常同样降级

    if ENGINE is None:
        return jsonify({"error": f"后端引擎初始化失败: {INIT_ERROR}"}), 500

    try:
        # 抽牌
        draw_result = ENGINE.draw_cards(spread_key=spread_key, question=question)

        # 3. 附加 name / image
        positions = [c["position_name"] for c in draw_result["cards"]]
        cards_out = []
        for c in draw_result["cards"]:
            cid = c["card_id"]
            info = CARD_MAP.get(cid, {"name": f"Card_{cid}", "image": _card_image(cid)})
            cards_out.append({
                "position":          c["position"],
                "position_name":     c["position_name"],
                "position_semantic": c["position_semantic"],
                "card_id":           cid,
                "name":              info["name"],
                "image":             info["image"],
                "orientation":       c["orientation"],
                "is_major":          c["is_major"],
            })

        # 取各位置的 semantic，供前端按顺序赋给用户选中的牌
        spread_positions_meta = ENGINE.spreads.get(spread_key, {}).get("positions", [])

        return jsonify({
            "spread":             draw_result["spread"],
            "spread_name":        draw_result["spread_name"],
            "positions":          positions,
            "position_semantics": [p.get("semantic", "") for p in spread_positions_meta],  # 【Bug 6 配套】
            "draw_count":         len(cards_out),          # 【Bug 3 修复】前端 STATE.drawCount 依赖此字段
            "cards":              cards_out,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── C. POST /api/reading ─────────────────────────────────────────────────────

@app.route("/api/reading", methods=["POST"])
def api_reading():
    if INIT_ERROR:
        return Response(f"后端初始化失败: {INIT_ERROR}", mimetype="text/plain", status=500)

    data = request.get_json(force=True, silent=True) or {}
    question = data.get("question", "")
    cards = data.get("cards", [])

    # 把前端 cards 数组转换为 run_pipeline 期望的 draw_result 格式
    draw_result = {
        "cards": [
            {
                "card_id":           c["card_id"],
                "orientation":       c["orientation"],
                "position_name":     c.get("position_name", f"位置{i + 1}"),
                "position_semantic": c.get("position_semantic", ""),
                "position":          i + 1,
            }
            for i, c in enumerate(cards)
        ]
    }

    gen = PIPELINE.run_pipeline(question, draw_result)

    # run_pipeline 在安全审查不通过时直接 return（不 yield），此时 next() 抛 StopIteration
    try:
        first = next(gen)
    except StopIteration as e:
        result = e.value
        if isinstance(result, dict) and result.get("status") == "BLOCKED":
            return Response(result.get("message", "安全拦截"), mimetype="text/plain")
        return Response("解读失败，请重试。", mimetype="text/plain", status=500)
    except Exception as e:
        return Response(f"解读出错: {e}", mimetype="text/plain", status=500)

    # first == {"status": "STREAMING"}，开始流式输出
    def stream():
        try:
            for item in gen:
                if not isinstance(item, dict):
                    continue
                if "chunk" in item:
                    yield item["chunk"]
                elif item.get("status") == "SUCCESS":
                    break
                elif item.get("status") == "BLOCKED":
                    yield item.get("message", "")
                    break
        except Exception as e:
            yield f"\n【系统错误】{e}"

    return Response(stream(), mimetype="text/plain")


# ─── 入口 ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
