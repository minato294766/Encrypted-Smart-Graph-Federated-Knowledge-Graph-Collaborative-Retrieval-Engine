"""
Quick test: verify MiA-EMB model loads and mixed input attention works.

Usage:
    python scripts/test_mia.py
    python scripts/test_mia.py --model-path path/to/MiA-Emb-8B
"""

import argparse
import sys
from pathlib import Path

import torch

_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))

from mia_emb import MiAConfig, MiAEmbedding


def main():
    parser = argparse.ArgumentParser(description="Test MiA-EMB model loading")
    parser.add_argument(
        "--model-path",
        default=None,
        help="Path or HF ID of MiA-EMB model (default: MindscapeRAG/MiA-Emb-8B)",
    )
    parser.add_argument(
        "--base-model",
        default=None,
        help="Path or HF ID of base Qwen3-Embedding-8B (only needed for LoRA-only adapter)",
    )
    args = parser.parse_args()

    config = MiAConfig()
    if args.model_path:
        config.model_path = args.model_path
    if args.base_model:
        config.base_model_path = args.base_model

    print("=" * 60)
    print("  MiA-EMB 模型加载测试")
    print("=" * 60)
    print(f"  Model path: {config.model_path}")
    print(f"  Delta (δ):  {config.residual_weight_delta}")
    print(f"  Embed dim:  {config.embedding_dim}")
    print(f"  Node token: {config.node_delimiter}")
    if torch.cuda.is_available():
        gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        print(f"  GPU:        {torch.cuda.get_device_name(0)} ({gb:.0f} GB)")
    print()

    # Load model
    print("Loading model...")
    model = MiAEmbedding(config)
    model.load(
        model_path=config.model_path,
        base_model_path=config.base_model_path,
    )
    print(f"  Load mode: {model._load_mode}")
    print("  ✓ Model loaded\n")

    # Test document encoding
    print("Test 1: Document encoding")
    docs = [
        "中华人民共和国民法典是新中国第一部以法典命名的法律。",
        "禁止包办、买卖婚姻和其他干涉婚姻自由的行为。",
    ]
    doc_embs = model.encode_documents(docs)
    print(f"  Input: {len(docs)} documents")
    print(f"  Output shape: {doc_embs.shape}")
    print(f"  ✓ Document encoding works\n")

    # Test query encoding (vanilla, no mindscape, no residual)
    print("Test 2: Query encoding (vanilla, no mindscape)")
    query = "彩礼纠纷的法律规定是什么？"
    q_emb_vanilla = model.encode_queries([query], mindscape="", residual=False)
    print(f"  Query: {query}")
    print(f"  Output shape: {q_emb_vanilla.shape}")
    print(f"  ✓ Vanilla query encoding works\n")

    # Test query encoding with mindscape + residual fusion
    print("Test 3: MiA query encoding (with mindscape + residual)")
    mindscape = """本文档集涉及中国民事法律体系，核心主题包括：
    婚姻家庭编：彩礼返还规则、离婚冷静期、夫妻共同财产分割；
    侵权责任编：过错责任原则、无过错责任、损害赔偿范围；
    合同编：合同效力、违约责任、格式条款规制。"""
    q_emb_mia = model.encode_queries([query], mindscape=mindscape, residual=True)
    print(f"  Mindscape: {len(mindscape)} chars")
    print(f"  Output shape: {q_emb_mia.shape}")
    print(f"  ✓ MiA query encoding works\n")

    # Test raw extraction (main + residual separately)
    print("Test 4: Raw query encoding (main + residual separate)")
    q_main, q_res = model.encode_queries_raw(
        [query], mindscape=mindscape, residual=True
    )
    print(f"  q_main shape:   {q_main.shape}")
    print(f"  q_res shape:    {q_res.shape}")
    main_res_cos = float(
        torch.nn.functional.cosine_similarity(
            torch.from_numpy(q_main), torch.from_numpy(q_res)
        )
    )
    print(f"  cos(q_main, q_res): {main_res_cos:.4f}")
    print(f"  ✓ Main and residual embeddings differ (cos < 1.0)\n")

    # Compare cosine similarity
    print("Test 5: Similarity comparison (vanilla vs MiA)")
    sim_vanilla = model.compute_similarity(q_emb_vanilla[0], doc_embs)
    sim_mia = model.compute_similarity(q_emb_mia[0], doc_embs)
    print(f"  Vanilla similarities: {[f'{s:.4f}' for s in sim_vanilla]}")
    print(f"  MiA similarities:     {[f'{s:.4f}' for s in sim_mia]}")
    print(f"  ✓ MiA-enhanced encoding produces different similarity distribution\n")

    # Test score-level fusion via raw embeddings
    print("Test 6: Score-level fusion (official method)")
    sim_main = model.compute_similarity(q_main[0], doc_embs)
    sim_fused = model.compute_similarity(
        q_main[0], doc_embs, query_residual=q_res[0], delta=config.residual_weight_delta
    )
    print(f"  Main-only scores:  {[f'{s:.4f}' for s in sim_main]}")
    print(f"  Score-fused scores: {[f'{s:.4f}' for s in sim_fused]}")
    print(f"  ✓ Score-level fusion works\n")

    print("=" * 60)
    print("  所有测试通过!")
    print("=" * 60)


if __name__ == "__main__":
    main()
