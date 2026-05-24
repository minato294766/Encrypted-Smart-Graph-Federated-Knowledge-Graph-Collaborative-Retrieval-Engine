"""
MiA-EMB (Mixed Input Attention Embedding) — official implementation.

Loads the merged MiA-EMB-8B model from MindscapeRAG/MiA-Emb-8B.
Implements the official prompt format, token-position extraction,
and score-level residual fusion as described in the paper.

Key differences from the paper's vanilla Qwen3-Emb:
  - Query prompt injects global mindscape summary
  - [PAD] token captures residual (query-only) embedding
  - <|repo_name|> token captures full-context embedding
  - Score fusion: (1-delta)*q_main*c + delta*q_res*c

Paper: Mindscape-Aware RAG (arXiv:2512.17220)
"""

import logging
import os
import tempfile
from typing import Optional

import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer

from .mia_config import MiAConfig

logger = logging.getLogger("mia_emb")


def _get_gpu_memory_gb() -> float:
    """Return available GPU memory in GB, or 0 if no CUDA device."""
    if not torch.cuda.is_available():
        return 0.0
    try:
        free, total = torch.cuda.mem_get_info()
        return total / (1024 ** 3)
    except Exception:
        return 0.0


def _get_attn_implementation() -> str:
    """Return the best available attention implementation.

    Tries flash_attention_2 -> sdpa -> eager, falling back gracefully.
    """
    try:
        import flash_attn  # noqa: F401
        return "flash_attention_2"
    except ImportError:
        pass
    if hasattr(torch.nn.functional, "scaled_dot_product_attention"):
        return "sdpa"
    return "eager"


# ═══════════════════════════════════════════════════════════════
# Pooling helpers (matching official MiA-EMB reference)
# ═══════════════════════════════════════════════════════════════

def _last_token_pool(
    last_hidden_state: torch.Tensor,
    attention_mask: torch.Tensor,
) -> torch.Tensor:
    """Pool embeddings from the last non-padding token of each sequence.

    With padding_side="left", the last token in the sequence is always
    a real content token (padding tokens are on the left).
    """
    sequence_lengths = attention_mask.sum(dim=1) - 1  # (batch,)
    batch_indices = torch.arange(
        last_hidden_state.shape[0], device=last_hidden_state.device
    )
    return last_hidden_state[batch_indices, sequence_lengths]


def _extract_token_embedding(
    last_hidden_state: torch.Tensor,
    input_ids: torch.Tensor,
    token_id: int,
) -> Optional[torch.Tensor]:
    """Extract hidden state at the position of a specific token.

    Returns the embedding for the first occurrence of token_id in each
    sequence, or None if the token is not found.
    """
    mask = input_ids == token_id  # (batch, seq_len)
    if not mask.any():
        return None
    positions = mask.int().argmax(dim=-1)  # (batch,)
    found = mask.any(dim=-1)  # (batch,)
    batch_indices = torch.arange(
        last_hidden_state.shape[0], device=last_hidden_state.device
    )
    embeddings = last_hidden_state[batch_indices, positions]
    embeddings[~found] = 0.0
    return embeddings


# ═══════════════════════════════════════════════════════════════
# MiAEmbedding
# ═══════════════════════════════════════════════════════════════

class MiAEmbedding:
    """Mixed Input Attention embedding model.

    Loads the MiA-EMB-8B model and provides:
      - encode_queries():  context-aware query encoding with residual fusion
      - encode_documents(): standard document chunk encoding
      - compute_similarity(): cosine similarity

    VRAM auto-adaptation:
      >= 24 GB -> full GPU load
      16-24 GB -> GPU with device_map="auto"
      < 16 GB  -> 8-bit quantization + CPU offload
    """

    def __init__(
        self,
        config: MiAConfig,
        device: Optional[str] = None,
    ):
        self.config = config
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
        self._model = None
        self._tokenizer = None
        self._loaded = False
        self._load_mode = "full"

    # ── Public API ───────────────────────────────────────────────

    def load(
        self,
        model_path: Optional[str] = None,
        base_model_path: Optional[str] = None,
    ):
        """Load MiA-EMB model, auto-detecting merged vs LoRA-only.

        Merged model:  AutoModel.from_pretrained() loads directly.
        LoRA adapter: base Qwen3-Emb-8B + LoRA -> merge_and_unload().
        """
        path = model_path or self.config.model_path
        base_path = base_model_path or self.config.base_model_path

        gpu_gb = _get_gpu_memory_gb()
        logger.info(f"GPU memory: {gpu_gb:.1f} GB")

        lora_only = self._is_lora_only(path)
        if lora_only:
            logger.info(f"Detected LoRA-only adapter at: {path}")
            logger.info(f"Base model: {base_path}")
            self._tokenizer = AutoTokenizer.from_pretrained(
                base_path, trust_remote_code=True, padding_side="left",
            )
        else:
            self._tokenizer = AutoTokenizer.from_pretrained(
                path, trust_remote_code=True, padding_side="left",
            )

        if self._tokenizer.pad_token is None:
            self._tokenizer.pad_token = self._tokenizer.eos_token

        if lora_only:
            self._load_lora_merge(base_path, path, gpu_gb)
        elif gpu_gb >= 24 or self.device == "cpu":
            self._load_full(path)
        elif gpu_gb >= 16:
            self._load_auto(path)
        else:
            self._load_8bit(path)

        self._model.eval()
        self._loaded = True
        logger.info(
            f"MiAEmbedding loaded ({self._load_mode} mode) on {self.device}"
        )

    @staticmethod
    def _is_lora_only(path: str) -> bool:
        """Check if path contains only LoRA adapter weights (no base model)."""
        if not os.path.isdir(path):
            return False
        has_adapter = os.path.exists(os.path.join(path, "adapter_model.safetensors"))
        has_config = os.path.exists(os.path.join(path, "adapter_config.json"))
        has_base = (
            os.path.exists(os.path.join(path, "model.safetensors"))
            or os.path.exists(os.path.join(path, "pytorch_model.bin"))
            or any(
                f.startswith("model-") and f.endswith(".safetensors")
                for f in os.listdir(path)
            )
        )
        return has_adapter and has_config and not has_base

    def _load_lora_merge(self, base_path: str, lora_path: str, gpu_gb: float):
        """Load base Qwen3-Embedding-8B + LoRA adapter, then merge."""
        try:
            from peft import PeftModel
        except ImportError:
            raise ImportError(
                "peft is required for LoRA adapter loading. "
                "Install with: pip install peft"
            )

        logger.info("Loading base model + LoRA adapter...")

        base_model = AutoModel.from_pretrained(
            base_path,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16,
            attn_implementation=_get_attn_implementation(),
        )

        if gpu_gb >= 24 or self.device == "cpu":
            base_model = base_model.to(self.device)
            device_map = None
        else:
            device_map = "auto"

        peft_model = PeftModel.from_pretrained(
            base_model, lora_path,
            torch_dtype=torch.bfloat16,
            device_map=device_map,
        )

        self._model = peft_model.merge_and_unload()
        self._load_mode = "lora_merged"
        logger.info("LoRA adapter merged into base model")

    def _load_full(self, path: str):
        """>=24 GB: full model on GPU 0."""
        logger.info("Loading MiA-EMB model (full GPU mode)...")
        self._model = AutoModel.from_pretrained(
            path,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16,
            attn_implementation=_get_attn_implementation(),
            device_map={"": 0},
        )
        self._load_mode = "full"

    def _load_auto(self, path: str):
        """16-24 GB: device_map="auto" distributes across available GPUs."""
        logger.info("Loading MiA-EMB model (auto device-map mode)...")
        self._model = AutoModel.from_pretrained(
            path,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16,
            attn_implementation=_get_attn_implementation(),
            device_map="auto",
        )
        self._load_mode = "auto"

    def _load_8bit(self, path: str):
        """<16 GB: 8-bit quantization with CPU offload."""
        logger.info("Loading MiA-EMB model (8-bit offload mode)...")
        offload_dir = os.path.join(tempfile.gettempdir(), "mia_offload")
        os.makedirs(offload_dir, exist_ok=True)
        try:
            self._model = AutoModel.from_pretrained(
                path,
                trust_remote_code=True,
                load_in_8bit=True,
                device_map="auto",
                offload_folder=offload_dir,
            )
            self._load_mode = "8bit"
        except Exception:
            logger.warning("8-bit loading failed, falling back to CPU")
            self._model = AutoModel.from_pretrained(
                path,
                trust_remote_code=True,
                torch_dtype=torch.bfloat16,
                device_map="cpu",
            )
            self.device = "cpu"
            self._load_mode = "8bit"

    # ── Properties ───────────────────────────────────────────────

    @property
    def loaded(self) -> bool:
        return self._loaded

    # ── Query Encoding ───────────────────────────────────────────

    def encode_queries(
        self,
        queries: list[str],
        mindscape: str = "",
        residual: bool = True,
        mode: str = "chunk",
    ) -> np.ndarray:
        """Encode queries with mixed-input attention.

        Returns main query embeddings (full-context: query + mindscape) suitable
        for vector search. For residual-aware similarity use encode_queries_raw()
        + compute_similarity() which performs proper score-level fusion.

        Shape: (len(queries), embedding_dim), L2-normalized.
        """
        if not self._loaded:
            raise RuntimeError("Model not loaded. Call .load() first.")

        embeddings = []
        for query in queries:
            emb = self._encode_single_query(query, mindscape, residual, mode)
            embeddings.append(emb)
        return np.array(embeddings)

    def encode_queries_raw(
        self,
        queries: list[str],
        mindscape: str = "",
        residual: bool = True,
        mode: str = "chunk",
    ) -> tuple[np.ndarray, Optional[np.ndarray]]:
        """Encode queries and return (main, residual) separately.

        Returns:
            Tuple of (q_main, q_residual) where:
              - q_main: (len(queries), dim) - full-context embedding
              - q_residual: (len(queries), dim) or None - query-only embedding
        """
        if not self._loaded:
            raise RuntimeError("Model not loaded. Call .load() first.")

        mains, resids = [], []
        for query in queries:
            q_main, q_res = self._encode_single_query_raw(query, mindscape, residual, mode)
            mains.append(q_main.float().numpy())
            resids.append(q_res.float().numpy() if q_res is not None else None)

        q_main_arr = np.array(mains)
        q_res_arr = np.array(resids) if any(r is not None for r in resids) else None
        return q_main_arr, q_res_arr

    # ── Document Encoding ────────────────────────────────────────

    def encode_documents(
        self,
        documents: list[str],
        batch_size: int = 8,
    ) -> np.ndarray:
        """Encode document chunks with standard last-token pooling."""
        if not self._loaded:
            raise RuntimeError("Model not loaded. Call .load() first.")
        if not documents:
            return np.array([])

        all_embeddings = []
        for i in range(0, len(documents), batch_size):
            batch = documents[i : i + batch_size]
            inputs = self._tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=self.config.max_token_size,
                return_tensors="pt",
            )
            device = next(self._model.parameters()).device
            inputs = {k: v.to(device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self._model(**inputs)
                hidden = _last_token_pool(
                    outputs.last_hidden_state, inputs["attention_mask"]
                )
                hidden = F.normalize(hidden, p=2, dim=-1)

            all_embeddings.append(hidden.cpu().float().numpy())

        return (
            np.concatenate(all_embeddings, axis=0)
            if all_embeddings
            else np.array([])
        )

    # ── Similarity ───────────────────────────────────────────────

    @staticmethod
    def compute_similarity(
        query_embedding: np.ndarray,
        doc_embeddings: np.ndarray,
        query_residual: Optional[np.ndarray] = None,
        delta: float = 0.5,
    ) -> np.ndarray:
        """Cosine similarity with optional score-level residual fusion.

        Args:
            query_embedding: (dim,) or (1, dim) - main query embedding.
            doc_embeddings: (n, dim) - document/chunk embeddings.
            query_residual: (dim,) or (1, dim) - residual query embedding, optional.
            delta: Residual weight.

        Returns:
            (n,) similarity scores.
        """
        q = torch.from_numpy(np.atleast_2d(query_embedding))
        d = torch.from_numpy(doc_embeddings)
        score = (q @ d.T).squeeze(0)

        if query_residual is not None:
            q_res = torch.from_numpy(np.atleast_2d(query_residual))
            residual_score = (q_res @ d.T).squeeze(0)
            score = (1.0 - delta) * score + delta * residual_score

        return score.cpu().float().numpy()

    # ── Internal: Single Query Encoding ──────────────────────────

    def _encode_single_query(
        self,
        query: str,
        mindscape: str,
        residual: bool,
        mode: str = "chunk",
    ) -> np.ndarray:
        """Encode a single query, returning L2-normalized main embedding.

        The main embedding captures the full mixed-input context (query + mindscape).
        For residual fusion use encode_queries_raw() + compute_similarity() which
        performs proper score-level fusion per the official MiA-EMB paper.
        """
        q_main, _ = self._encode_single_query_raw(query, mindscape, residual, mode)
        return q_main.float().numpy()

    def _encode_single_query_raw(
        self,
        query: str,
        mindscape: str,
        residual: bool,
        mode: str = "chunk",
    ) -> tuple[torch.Tensor, Optional[torch.Tensor]]:
        """Encode a single query, returning (q_main, q_res) both L2-normalized.

        q_main is extracted from <|repo_name|> position (full-context embedding).
        q_res is extracted from [PAD] position (query-only embedding).

        Args:
            mode: "chunk" for chunk retrieval (uses last-token pool fallback),
                  "node" for KG entity retrieval.
        """
        prompt = self._build_query_prompt(query, mindscape, residual, mode)

        inputs = self._tokenizer(
            prompt,
            padding=False,
            truncation=True,
            max_length=self.config.max_token_size,
            return_tensors="pt",
        )
        device = next(self._model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self._model(**inputs)

        hidden_states = outputs.last_hidden_state  # (1, seq_len, hidden_dim)
        input_ids = inputs["input_ids"]

        # Main embedding: extract from <|repo_name|> token position
        node_id = self._tokenizer.encode(
            self.config.node_delimiter, add_special_tokens=False
        )[0]
        q_main = _extract_token_embedding(hidden_states, input_ids, node_id)
        if q_main is None:
            q_main = _last_token_pool(hidden_states, inputs["attention_mask"])

        q_main = F.normalize(q_main, p=2, dim=-1).squeeze(0).cpu()

        # Residual embedding: extract from [PAD] token position
        q_res = None
        if residual:
            pad_id = self._tokenizer.pad_token_id
            q_res = _extract_token_embedding(hidden_states, input_ids, pad_id)
            if q_res is not None:
                q_res = F.normalize(q_res, p=2, dim=-1).squeeze(0).cpu()

        return q_main, q_res

    # ── Internal: Prompt Construction ────────────────────────────

    def _build_query_prompt(
        self,
        query: str,
        mindscape: str,
        residual: bool,
        mode: str = "chunk",
    ) -> str:
        """Build the official MiA-EMB query prompt.

        Format: Instruct: {task}\nQuery: {query}[PAD]{summary_prefix}{mindscape}<|repo_name|>

        The [PAD] token (inserted between query and summary) is the residual
        extraction point - its hidden state captures the query-only context.
        The <|repo_name|> token at the end captures the full mixed context.

        Args:
            mode: "chunk" for text-chunk retrieval, "node" for KG entity retrieval.
        """
        pad = self._tokenizer.pad_token if residual else ""
        safe_mindscape = mindscape if mindscape else " "
        template = (
            self.config.query_prompt_chunk if mode == "chunk"
            else self.config.query_prompt_node
        )
        return template.format(
            query=query, pad=pad, mindscape=safe_mindscape
        )
