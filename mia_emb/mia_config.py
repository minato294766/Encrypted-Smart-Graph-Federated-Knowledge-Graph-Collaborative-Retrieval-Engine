"""
MiA-EMB (Mixed Input Attention Embedding) Configuration.

Based on: Mindscape-Aware RAG (arXiv:2512.17220)
MiA-Emb-8B: fine-tuned on Qwen3-Embedding-8B
"""

from dataclasses import dataclass


@dataclass
class MiAConfig:
    # ── Residual Fusion ──
    residual_weight_delta: float = 0.5
    """Score-level fusion: final_score = (1-δ)·q_main·c + δ·q_res·c"""

    # ── Special Tokens (matches official MiA-EMB tokenizer) ──
    node_delimiter: str = "<|repo_name|>"
    """Special token for node-retrieval embedding extraction."""

    # ── Model Paths ──
    model_path: str = "MindscapeRAG/MiA-Emb-8B"
    """HF ID or local path for MiA-EMB (merged model or LoRA adapter)."""

    base_model_path: str = "Qwen/Qwen3-Embedding-8B"
    """HF ID or local path for base Qwen3-Embedding-8B.
    Only used when model_path is a LoRA-only directory (auto-detected)."""

    # ── Mindscape Summarization ──
    chunk_token_size: int = 1200
    chunk_summary_max_tokens: int = 150
    global_summary_max_tokens: int = 500
    summary_temperature: float = 0.1

    # ── DeepSeek API ──
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_api_key: str = ""

    # ── Retrieval ──
    top_k_chunks: int = 20
    top_k_nodes: int = 60

    # ── Embedding Dimensions ──
    embedding_dim: int = 4096
    max_token_size: int = 4096

    @property
    def query_prompt_chunk(self) -> str:
        """Official MiA-EMB query prompt for chunk retrieval.

        Inserts [PAD] between query and summary for residual extraction.
        Query text ends with <|repo_name|> for main embedding extraction.
        """
        task_desc = (
            "Given a search query with the book's summary, retrieve relevant chunks "
            "or helpful entities summaries from the given context that answer the query"
        )
        summary_prefix = (
            "\n\nHere is the summary providing possibly useful global information. "
            "Please encode the query based on the summary:\n"
        )
        return (
            f"Instruct: {task_desc}\n"
            f"Query: {{query}}{{pad}}"
            f"{summary_prefix}{{mindscape}}{self.node_delimiter}"
        )

    @property
    def query_prompt_node(self) -> str:
        """Official MiA-EMB query prompt for node (entity) retrieval."""
        task_desc = (
            "Given a search query with the book's summary, retrieve relevant entities "
            "from the knowledge graph that help answer the query"
        )
        summary_prefix = (
            "\n\nHere is the summary providing possibly useful global information. "
            "Please encode the query based on the summary:\n"
        )
        return (
            f"Instruct: {task_desc}\n"
            f"Query: {{query}}{{pad}}"
            f"{summary_prefix}{{mindscape}}{self.node_delimiter}"
        )
