"""
MiA-RAG production usage example.

Usage:
    export DEEPSEEK_API_KEY="sk-your-key"
    python scripts/demo_mia_rag.py --doc-dir /path/to/docs --query "你的问题"
    python scripts/demo_mia_rag.py --doc-dir /path/to/docs --query "你的问题" \
        --model-path ./models/MiA-Emb-8B \
        --base-model /path/to/Qwen3-Embedding-8B
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))

from dotenv import load_dotenv
load_dotenv()

from mia_emb import MiAConfig, MiARAG


def load_documents(doc_dir: str) -> list[str]:
    """Load .txt documents with automatic encoding detection."""
    docs = []
    encodings = ["utf-8", "gbk", "gb2312", "gb18030", "latin-1"]

    for txt_file in sorted(Path(doc_dir).glob("*.txt")):
        content = None
        for enc in encodings:
            try:
                content = txt_file.read_text(encoding=enc)
                break
            except (UnicodeDecodeError, UnicodeError):
                continue

        if content and len(content.strip()) > 50:
            docs.append(content)
            print(f"  ✓ {txt_file.name} ({len(content)} chars)")
        elif content:
            print(f"  - {txt_file.name} (skipped, too short: {len(content)} chars)")
        else:
            print(f"  ✗ {txt_file.name} (encoding failed)")

    return docs


async def main():
    parser = argparse.ArgumentParser(description="MiA-RAG Production Demo")
    parser.add_argument("--doc-dir", default=None, help="Document directory")
    parser.add_argument("--query", default="彩礼返还的法律规定是什么？", help="Query string")
    parser.add_argument("--working-dir", default="./mia_rag_storage", help="LightRAG storage dir")
    parser.add_argument("--model-path", default=None, help="MiA-EMB model path or HF ID")
    parser.add_argument("--base-model", default=None, help="Base Qwen3-Embedding-8B path")
    parser.add_argument("--api-key", default=None, help="DeepSeek API key")
    parser.add_argument("--lang", default=None, choices=["zh", "en"], help="Document language")
    args = parser.parse_args()

    # ── Config ──
    api_key = args.api_key or os.getenv("DEEPSEEK_API_KEY", "")
    config = MiAConfig(deepseek_api_key=api_key)
    if args.model_path:
        config.model_path = args.model_path
    if args.base_model:
        config.base_model_path = args.base_model

    if not api_key:
        print("⚠  DEEPSEEK_API_KEY not set. Mindscape summarization will be skipped.")

    # ── Load documents ──
    documents = []
    if args.doc_dir:
        doc_dir = args.doc_dir
        if not os.path.isabs(doc_dir):
            doc_dir = str(Path(doc_dir).resolve())
        if Path(doc_dir).exists():
            documents = load_documents(doc_dir)
            print(f"\nLoaded {len(documents)} documents")
        else:
            print(f"⚠  Directory not found: {doc_dir}")

    if not documents:
        print("No documents found. Using built-in examples...")
        documents = [
            "中华人民共和国民法典第一千零四十二条：禁止包办、买卖婚姻和其他干涉婚姻自由的行为。"
            "禁止借婚姻索取财物。禁止重婚。禁止有配偶者与他人同居。",
            "最高人民法院关于审理涉彩礼纠纷案件适用法律若干问题的规定：第三条 人民法院在审理涉彩礼纠纷案件中，"
            "可以根据一方给付财物的目的、给付的时间、给付的方式、财物的价值、给付人及接收人等事实，认定是否属于彩礼。",
        ]

    # ── Initialize ──
    rag = MiARAG(config=config, working_dir=args.working_dir)
    lang = args.lang or "zh"
    await rag.initialize(lang=lang)

    try:
        # Insert documents (builds mindscape + loads into LightRAG)
        await rag.insert_documents(documents)

        # Query
        print(f"\n{'='*60}")
        print(f"  Query: {args.query}")
        print(f"{'='*60}")
        result = await rag.query(args.query)
        print(f"\n  ── Answer ──\n  {result['answer']}")
        print(f"\n  ── Metadata ──")
        for k, v in result["metadata"].items():
            print(f"  {k}: {v}")
    finally:
        await rag.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except RuntimeError as e:
        if "cannot be called from a running event loop" in str(e):
            import nest_asyncio
            nest_asyncio.apply()
            asyncio.get_event_loop().run_until_complete(main())
        else:
            raise
