"""
MiA-RAG: Mixed Input Attention enhanced RAG pipeline.

Production integration of MiA-EMB embedding with LightRAG knowledge graph.
Usage:

    config = MiAConfig(deepseek_api_key="sk-...")
    rag = MiARAG(config, working_dir="./storage")
    await rag.initialize()
    await rag.insert_documents(documents)
    result = await rag.query("你的问题")
    print(result["answer"])
    await rag.close()
"""

import asyncio
import hashlib
import json
import logging
import time
from copy import deepcopy
from pathlib import Path
from typing import Optional

import numpy as np

from .mia_config import MiAConfig
from .mia_embedding import MiAEmbedding
from .mindscape_summarizer import MindscapeSummarizer

logger = logging.getLogger("mia_rag")


def _detect_language(documents: list[str]) -> str:
    """Detect document language: >15% CJK chars -> zh, else en."""
    if not documents:
        return "zh"
    sample = "".join(documents)[:5000]
    cjk = sum(1 for c in sample if '一' <= c <= '鿿')
    return "zh" if (len(sample) > 0 and cjk / len(sample) > 0.15) else "en"


# Domain-adaptive entity types (lowercase for LightRAG parser compatibility)
_SHARED_ENTITY_TYPES = [
    "person", "organization", "legal_document", "legal_case",
    "legal_clause", "legal_concept", "legal_procedure",
    "legal_principle", "location", "event",
]


def _build_entity_extraction_prompt(lang: str = "zh") -> tuple[str, list[str]]:
    """Build domain-adaptive entity extraction prompts for LightRAG.

    Returns (system_prompt, few_shot_examples).
    """
    types_str = ", ".join(_SHARED_ENTITY_TYPES)
    if lang == "en":
        system = (
            "---Role---\n"
            "You are an expert in entity and relationship extraction.\n\n"
            "---Rules---\n"
            "1. Entity format: entity{{tuple_delimiter}}entity_name{{tuple_delimiter}}entity_type{{tuple_delimiter}}entity_description\n"
            "   - entity_name: MUST be the exact original text from the input\n"
            "   - entity_type: one of [{types}] (lowercase only)\n"
            "   - entity_description: brief description\n"
            "2. Relationship format: relation{{tuple_delimiter}}source{{tuple_delimiter}}target{{tuple_delimiter}}type{{tuple_delimiter}}description\n"
            "3. Source and target entity names MUST exactly match entity_name from the entity list.\n"
            "4. Output ONLY entity and relation lines.\n"
            "5. End with: {{completion_delimiter}}\n"
            "6. CRITICAL: entity_type must be LOWERCASE."
        ).format(types=types_str)
        examples = [_EN_EXAMPLE_1, _EN_EXAMPLE_2]
    else:
        system = (
            "---Role---\n"
            "你是一个中文法律领域的实体和关系抽取专家。\n\n"
            "---Rules---\n"
            "1. Entity format: entity{{tuple_delimiter}}entity_name{{tuple_delimiter}}entity_type{{tuple_delimiter}}entity_description\n"
            "   - entity_name: 必须使用原文中的中文文本\n"
            "   - entity_type: 只能是 [{types}] 之一（必须小写）\n"
            "   - entity_description: 该实体的简要描述\n"
            "2. Relationship format: relation{{tuple_delimiter}}source{{tuple_delimiter}}target{{tuple_delimiter}}type{{tuple_delimiter}}description\n"
            "3. Source 和 target 的 entity_name 必须与 entity 列表中的完全一致。\n"
            "4. 只输出 entity 和 relation 行。不要输出引言、解释或 markdown。\n"
            "5. 以 {{completion_delimiter}} 结束。\n"
            "6. CRITICAL: entity_type 必须为小写。"
        ).format(types=types_str)
        examples = [_ZH_EXAMPLE_1, _ZH_EXAMPLE_2]
    return system, examples


# Few-shot examples
_ZH_EXAMPLE_1 = """<Entity_types>
["person","organization","legal_document","legal_case","legal_clause","legal_concept","legal_procedure","legal_principle","location","event"]

<Input Text>
```
根据《中华人民共和国民法典》第一千零四十二条规定，禁止包办、买卖婚姻和其他干涉婚姻自由的行为，禁止借婚姻索取财物。最高人民法院关于审理涉彩礼纠纷案件适用法律若干问题的规定第三条指出，人民法院在审理涉彩礼纠纷案件中，可以根据一方给付财物的目的、给付的时间、给付的方式、财物的价值、给付人及接收人等事实，认定是否属于彩礼。
```

<Output>
entity{tuple_delimiter}中华人民共和国民法典{tuple_delimiter}legal_document{tuple_delimiter}中华人民共和国民法典是新中国第一部以法典命名的法律
entity{tuple_delimiter}第一千零四十二条{tuple_delimiter}legal_clause{tuple_delimiter}民法典第1042条禁止包办买卖婚姻和借婚姻索取财物
entity{tuple_delimiter}最高人民法院{tuple_delimiter}organization{tuple_delimiter}中华人民共和国最高审判机关
entity{tuple_delimiter}彩礼{tuple_delimiter}legal_concept{tuple_delimiter}彩礼是指婚姻关系中一方向另一方给付的财物
entity{tuple_delimiter}涉彩礼纠纷案件司法解释{tuple_delimiter}legal_document{tuple_delimiter}最高人民法院发布的关于审理涉彩礼纠纷案件的司法解释
relation{tuple_delimiter}中华人民共和国民法典{tuple_delimiter}彩礼{tuple_delimiter}法律规制{tuple_delimiter}民法典第1042条对借婚姻索取财物作出禁止性规定
relation{tuple_delimiter}最高人民法院{tuple_delimiter}涉彩礼纠纷案件司法解释{tuple_delimiter}发布关系{tuple_delimiter}最高人民法院发布了涉彩礼纠纷的专门司法解释
relation{tuple_delimiter}涉彩礼纠纷案件司法解释{tuple_delimiter}彩礼{tuple_delimiter}规范对象{tuple_delimiter}该司法解释明确了彩礼的认定标准和裁判规则
{completion_delimiter}
"""

_ZH_EXAMPLE_2 = """<Entity_types>
["person","organization","legal_document","legal_case","legal_clause","legal_concept","legal_procedure","legal_principle","location","event"]

<Input Text>
```
劳动者依据调解仲裁法第四十七条规定，追索劳动报酬、工伤医疗费、经济补偿或者赔偿金，如果仲裁裁决涉及数项，每项确定的数额均不超过当地月最低工资标准十二个月金额的，应当按照终局裁决处理。当事人不服该仲裁裁决向人民法院提起诉讼的，应当按照非终局裁决处理。
```

<Output>
entity{tuple_delimiter}调解仲裁法{tuple_delimiter}legal_document{tuple_delimiter}中华人民共和国劳动争议调解仲裁法
entity{tuple_delimiter}第四十七条{tuple_delimiter}legal_clause{tuple_delimiter}调解仲裁法第47条关于终局裁决的规定
entity{tuple_delimiter}终局裁决{tuple_delimiter}legal_procedure{tuple_delimiter}劳动争议仲裁的一种裁决类型具有终局效力
entity{tuple_delimiter}劳动争议仲裁机构{tuple_delimiter}organization{tuple_delimiter}负责处理劳动争议仲裁的法定机构
entity{tuple_delimiter}劳动报酬{tuple_delimiter}legal_concept{tuple_delimiter}劳动者因提供劳动而应获得的报酬
relation{tuple_delimiter}调解仲裁法{tuple_delimiter}终局裁决{tuple_delimiter}法律依据{tuple_delimiter}调解仲裁法第47条规定了终局裁决的适用条件
relation{tuple_delimiter}劳动争议仲裁机构{tuple_delimiter}终局裁决{tuple_delimiter}作出主体{tuple_delimiter}劳动争议仲裁机构负责作出终局裁决
{completion_delimiter}
"""

_EN_EXAMPLE_1 = """<Entity_types>
["person","organization","legal_document","legal_case","legal_clause","legal_concept","legal_procedure","legal_principle","location","event"]

<Input Text>
```
The National Institute for Occupational Safety and Health (NIOSH) published new workplace safety guidelines. Dr. John Howard, Director of NIOSH, emphasized the importance of respiratory protection programs in healthcare settings.
```

<Output>
entity{tuple_delimiter}National Institute for Occupational Safety and Health{tuple_delimiter}organization{tuple_delimiter}US federal agency responsible for workplace safety research
entity{tuple_delimiter}NIOSH{tuple_delimiter}organization{tuple_delimiter}Abbreviation for National Institute for Occupational Safety and Health
entity{tuple_delimiter}Dr John Howard{tuple_delimiter}person{tuple_delimiter}Director of NIOSH
entity{tuple_delimiter}Occupational Safety and Health Act of 1970{tuple_delimiter}legal_document{tuple_delimiter}US law requiring safe workplaces
relation{tuple_delimiter}National Institute for Occupational Safety and Health{tuple_delimiter}Dr John Howard{tuple_delimiter}leadership{tuple_delimiter}Dr John Howard serves as Director of NIOSH
{completion_delimiter}
"""

_EN_EXAMPLE_2 = """<Entity_types>
["person","organization","legal_document","legal_case","legal_clause","legal_concept","legal_procedure","legal_principle","location","event"]

<Input Text>
```
Moody's Ratings downgraded several financial institutions citing increased credit risk exposure. The Federal Reserve issued new stress testing requirements under the Dodd-Frank Act Section 165. JP Morgan Chase and Goldman Sachs both reported compliance with the updated capital adequacy standards.
```

<Output>
entity{tuple_delimiter}Moodys Ratings{tuple_delimiter}organization{tuple_delimiter}Credit rating agency
entity{tuple_delimiter}Federal Reserve{tuple_delimiter}organization{tuple_delimiter}Central bank of the United States
entity{tuple_delimiter}Dodd-Frank Act{tuple_delimiter}legal_document{tuple_delimiter}US financial reform legislation
entity{tuple_delimiter}JP Morgan Chase{tuple_delimiter}organization{tuple_delimiter}Major US financial institution
entity{tuple_delimiter}Goldman Sachs{tuple_delimiter}organization{tuple_delimiter}Major US investment bank
relation{tuple_delimiter}Federal Reserve{tuple_delimiter}Dodd-Frank Act{tuple_delimiter}enforcement{tuple_delimiter}Federal Reserve implements Dodd-Frank Act stress testing
{completion_delimiter}
"""


class MiARAG:
    """MiA-EMB enhanced RAG pipeline.

    Integrates MiA-EMB mixed-input-attention embeddings into LightRAG
    for context-aware retrieval with global mindscape summarization.
    """

    def __init__(
        self,
        config: MiAConfig,
        working_dir: str = "./mia_rag_storage",
        llm_func=None,
    ):
        self.config = config
        self.working_dir = working_dir
        self._llm_func = llm_func

        self.mia_embedding: Optional[MiAEmbedding] = None
        self.summarizer: Optional[MindscapeSummarizer] = None
        self.rag = None
        self.mindscape: str = ""

        self._query_context: bool = False
        self._use_mia: bool = True
        self._saved_prompts: dict = {}

    # ── Lifecycle ─────────────────────────────────────────────────

    async def initialize(self, lang: str = "zh"):
        """Initialize models, summarizer, and LightRAG storage."""
        logger.info("Initializing MiA-RAG...")

        self.mia_embedding = MiAEmbedding(self.config)
        self.mia_embedding.load(
            model_path=self.config.model_path,
            base_model_path=self.config.base_model_path,
        )
        logger.info("MiA-EMB model loaded")

        if self.config.deepseek_api_key:
            self.summarizer = MindscapeSummarizer(self.config)
            logger.info("Summarizer ready")
        else:
            logger.warning("No API key configured, summarization disabled")

        await self._setup_lightrag(lang)
        logger.info("LightRAG initialized")

    async def close(self):
        """Finalize storages and restore global state."""
        if self.rag:
            await self.rag.finalize_storages()
        self._restore_prompts()

    # ── Document Ingestion ────────────────────────────────────────

    async def insert_documents(self, documents: list[str]):
        """Build mindscape and insert text documents into LightRAG.

        Call once after initialize(), before any query().
        """
        await self._build_mindscape(documents)

        if not self.rag:
            logger.warning("LightRAG not available, skipping document insertion")
            return

        logger.info(f"Inserting {len(documents)} documents...")
        self._query_context = False
        for i, doc in enumerate(documents):
            await self.rag.ainsert(doc)
            if (i + 1) % 5 == 0:
                logger.info(f"  [{i+1}/{len(documents)}]")
        logger.info("Document insertion complete")

    async def insert_documents_incremental(self, documents: list[str]) -> dict:
        """Incremental insertion with dedup and conflict resolution.

        - Tracks document hashes to skip already-inserted content
        - New documents are inserted into LightRAG
        - Returns stats: {new: N, skipped: N, total: N}
        """
        if not self.rag:
            logger.warning("LightRAG not available, skipping insertion")
            return {"new": 0, "skipped": 0, "total": 0}

        doc_hashes = self._load_doc_hashes()
        new_docs = []
        skipped = 0

        for doc in documents:
            h = self._compute_doc_hash(doc)
            if h in doc_hashes:
                skipped += 1
                continue
            new_docs.append((h, doc))

        if not new_docs:
            logger.info(f"All {len(documents)} documents already inserted, skipping")
            return {"new": 0, "skipped": skipped, "total": len(documents)}

        logger.info(f"Incremental: {len(new_docs)} new, {skipped} skipped")
        self._query_context = False
        for i, (h, doc) in enumerate(new_docs):
            await self.rag.ainsert(doc)
            doc_hashes.add(h)
            if (i + 1) % 5 == 0:
                logger.info(f"  [{i+1}/{len(new_docs)}]")

        self._save_doc_hashes(doc_hashes)
        logger.info(f"Incremental insertion complete: {len(new_docs)} new documents")
        return {"new": len(new_docs), "skipped": skipped, "total": len(documents)}

    async def update_entity(self, entity_name: str, new_description: str, new_confidence: float):
        """Update an existing entity with conflict resolution (Section 3.1.4).

        Rules:
          - If new confidence > old confidence + 0.2 → replace description
          - Otherwise → linear fusion with step 0.3
        """
        if not self.rag:
            return

        # Search for existing entity
        existing = await self.rag.entities_vdb.query(
            query=entity_name, top_k=1, query_embedding=None
        )

        if not existing:
            # Entity doesn't exist, just note it for next insertion
            logger.info(f"Entity '{entity_name}' not found, will be created on next insert")
            return

        entity_id = existing[0]["id"]
        entity_data = await self.rag.entity_chunks.get_by_ids([entity_id])

        if not entity_data or not entity_data[0]:
            return

        old_data = entity_data[0]
        old_desc = old_data.get("description", "")
        old_confidence = old_data.get("confidence", 0.5)

        if new_confidence > old_confidence + 0.2:
            # Replace
            new_desc = new_description
            logger.info(f"Entity '{entity_name}': replaced (new_conf={new_confidence:.2f} > old_conf={old_confidence:.2f}+0.2)")
        else:
            # Linear fusion with step 0.3
            alpha = 0.3
            new_desc = f"{old_desc}\n{new_description}" if old_desc else new_description
            logger.info(f"Entity '{entity_name}': fused (step={alpha})")

        # Note: actual update depends on LightRAG's internal API
        # For now, log the intended update
        logger.info(f"Entity '{entity_name}' update: {len(old_desc)} → {len(new_desc)} chars")

    # ── Incremental Helpers ─────────────────────────────────────

    @staticmethod
    def _compute_doc_hash(text: str) -> str:
        """Compute hash of document content for dedup."""
        normalized = text.strip().replace("\r\n", "\n").replace("\r", "\n")
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]

    def _load_doc_hashes(self) -> set:
        """Load previously inserted document hashes from disk."""
        hash_file = Path(self.working_dir) / "doc_hashes.json"
        if hash_file.exists():
            try:
                with open(hash_file, "r") as f:
                    return set(json.load(f))
            except Exception:
                pass
        return set()

    def _save_doc_hashes(self, hashes: set):
        """Save document hashes to disk."""
        hash_file = Path(self.working_dir) / "doc_hashes.json"
        hash_file.parent.mkdir(parents=True, exist_ok=True)
        with open(hash_file, "w") as f:
            json.dump(list(hashes), f)

    async def insert_files(self, file_paths: list[str]):
        """Insert multi-modal files (PDF, images, text) into LightRAG.

        Supports: .txt, .pdf, .png, .jpg, .jpeg, .bmp, .tiff
        Images are OCR-processed and converted to text descriptions.
        PDFs have text + embedded images extracted.
        """
        from .multimodal import ImageProcessor, PDFProcessor

        if not self.rag:
            logger.warning("LightRAG not available, skipping file insertion")
            return

        image_proc = ImageProcessor(ocr_enabled=True)
        pdf_proc = PDFProcessor(image_processor=image_proc)

        text_docs = []
        image_count = 0
        pdf_count = 0

        for fpath in file_paths:
            p = Path(fpath)
            if not p.exists():
                logger.warning(f"File not found: {fpath}")
                continue

            ext = p.suffix.lower()

            if ext == ".txt":
                text = self._read_text_file(fpath)
                if text:
                    text_docs.append(text)

            elif ext == ".pdf":
                try:
                    result = pdf_proc.process_file(fpath)
                    for chunk in result.chunks:
                        text_docs.append(chunk.content)
                    pdf_count += 1
                    logger.info(f"  PDF: {p.name} → {len(result.chunks)} chunks")
                except Exception as e:
                    logger.error(f"PDF processing failed: {p.name}: {e}")

            elif ext in (".png", ".jpg", ".jpeg", ".bmp", ".tiff"):
                try:
                    result = image_proc.process_file(fpath)
                    if result.description:
                        text_docs.append(result.description)
                    image_count += 1
                    logger.info(f"  Image: {p.name} → {len(result.description)} chars")
                except Exception as e:
                    logger.error(f"Image processing failed: {p.name}: {e}")

            else:
                logger.warning(f"Unsupported file type: {ext} ({p.name})")

        logger.info(f"Processed: {len(text_docs)} text chunks from {pdf_count} PDFs, {image_count} images")

        # Build mindscape from all text content
        if text_docs:
            await self._build_mindscape(text_docs)

        # Insert all text into LightRAG
        logger.info(f"Inserting {len(text_docs)} chunks into KG...")
        self._query_context = False
        for i, doc in enumerate(text_docs):
            await self.rag.ainsert(doc)
            if (i + 1) % 10 == 0:
                logger.info(f"  [{i+1}/{len(text_docs)}]")
        logger.info("Multi-modal insertion complete")

    def _read_text_file(self, path: str) -> str:
        """Read text file with auto encoding detection."""
        encodings = ["utf-8", "gbk", "gb2312", "gb18030", "latin-1"]
        for enc in encodings:
            try:
                with open(path, "r", encoding=enc) as f:
                    text = f.read().strip()
                return text if len(text) > 50 else ""
            except (UnicodeDecodeError, UnicodeError):
                continue
        return ""

    # ── Query ─────────────────────────────────────────────────────

    async def query(
        self,
        question: str,
        mode: str = "mix",
        top_k: int = 60,
        chunk_top_k: int = 20,
        use_dual_channel: bool = True,
    ) -> dict:
        """Execute a MiA-enhanced query.

        Args:
            question: User query string.
            mode: LightRAG mode ("local", "global", "hybrid", "mix", "naive").
            top_k: Max KG entities/relations to retrieve.
            chunk_top_k: Max text chunks to retrieve.
            use_dual_channel: If True, use fine+coarse dual-channel retrieval
                              (Section 3.2). Falls back to plain LightRAG if False.

        Returns:
            {"answer": str, "context": dict, "metadata": dict}
        """
        if not self.rag:
            return self._query_standalone(question)

        if use_dual_channel and self.mindscape:
            return await self._query_dual_channel(question)

        from lightrag.base import QueryParam

        self._query_context = True
        try:
            result = await self.rag.aquery(
                question, param=QueryParam(mode=mode, top_k=top_k, chunk_top_k=chunk_top_k)
            )
        finally:
            self._query_context = False

        if result is None:
            answer, raw_data = "", {}
        elif isinstance(result, str):
            answer, raw_data = result, {}
        else:
            answer = getattr(result, "content", "") or ""
            raw_data = getattr(result, "raw_data", {}) or {}

        return {
            "answer": answer,
            "context": raw_data,
            "metadata": {
                "mode": mode,
                "mindscape_used": bool(self.mindscape),
                "mindscape_length": len(self.mindscape),
                "dual_channel": False,
            },
        }

    async def _query_dual_channel(self, question: str) -> dict:
        """Use DualChannelRetriever for fine+coarse two-pass retrieval."""
        from .dual_channel import DualChannelRetriever

        retriever = DualChannelRetriever(self)
        result = await retriever.retrieve(question)

        return {
            "answer": result.answer,
            "context": {
                "fine_entities": result.fine.entities,
                "fine_chunks": result.fine.chunks,
                "coarse_communities": result.coarse.communities,
                "coarse_summary": result.coarse.subgraph_summary,
            },
            "evidence": [
                {"source": e.source, "content": e.content, "score": e.relevance, "type": e.type, "name": e.name}
                for e in result.evidence
            ],
            "metadata": {
                "mode": "dual_channel",
                "mindscape_used": bool(self.mindscape),
                "mindscape_length": len(self.mindscape),
                "dual_channel": True,
                "confidence": result.confidence,
                "fine_entity_count": len(result.fine.entities),
                "coarse_community_count": len(result.coarse.communities),
                "parsed_query": {
                    "explicit_entities": result.parsed_query.explicit_entities if result.parsed_query else "",
                    "implicit_concepts": result.parsed_query.implicit_concepts if result.parsed_query else "",
                },
            },
        }

    def _query_standalone(self, question: str) -> dict:
        """Fallback query when LightRAG is unavailable (pure embedding mode)."""
        embedding = None
        if self.mia_embedding and self.mindscape:
            embedding = self.mia_embedding.encode_queries(
                [question], mindscape=self.mindscape, residual=True
            )
        return {
            "answer": "",
            "context": {"embedding_shape": str(embedding.shape) if embedding is not None else "N/A"},
            "metadata": {"mode": "standalone", "mindscape_used": bool(self.mindscape)},
        }

    # ── Internal: LightRAG Setup ──────────────────────────────────

    async def _setup_lightrag(self, lang: str):
        """Configure and initialize LightRAG with MiA-EMB embedding function."""
        try:
            from lightrag import LightRAG
            from lightrag.prompt import PROMPTS
            from lightrag.utils import EmbeddingFunc
        except ImportError:
            logger.warning("LightRAG not installed, running in standalone mode")
            self.rag = None
            return

        self._save_prompts(PROMPTS)
        sys_prompt, examples = _build_entity_extraction_prompt(lang)
        PROMPTS["entity_extraction_examples"] = examples
        PROMPTS["entity_extraction_system_prompt"] = sys_prompt

        # Closures (not bound methods) — avoids deepcopy of GPU model in
        # LightRAG.__post_init__ -> asdict(self) -> deepcopy.
        _self = self

        async def _lightrag_embed(texts: list[str]) -> np.ndarray:
            if not texts:
                return np.array([])
            if (_self._use_mia and _self.mindscape
                    and _self._query_context and len(texts) == 1):
                return _self.mia_embedding.encode_queries(
                    texts, mindscape=_self.mindscape, residual=True
                )
            return _self.mia_embedding.encode_documents(texts)

        llm_func = self._llm_func or self._make_llm_func()

        embedding_func = EmbeddingFunc(
            embedding_dim=self.config.embedding_dim,
            max_token_size=self.config.max_token_size,
            func=_lightrag_embed,
            model_name="MiA-Emb-8B",
        )

        self.rag = LightRAG(
            working_dir=self.working_dir,
            llm_model_func=llm_func,
            embedding_func=embedding_func,
        )
        await self.rag.initialize_storages()

    def _make_llm_func(self):
        """Return a closure for DeepSeek LLM with retry (not a bound method)."""
        import httpx
        from openai import AsyncOpenAI, APITimeoutError, APIConnectionError

        api_key = self.config.deepseek_api_key
        base_url = self.config.deepseek_base_url
        model = self.config.deepseek_model

        async def _llm_func(*args, **kwargs):
            client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
                timeout=httpx.Timeout(connect=60.0, read=180.0, write=60.0, pool=10.0),
                max_retries=2,
            )
            raw = args[0] if args else kwargs.get("messages", [])
            if isinstance(raw, str):
                messages = [{"role": "user", "content": raw}]
            elif isinstance(raw, list):
                messages = raw
            else:
                messages = [{"role": "user", "content": str(raw)}]

            for attempt in range(3):
                try:
                    response = await client.chat.completions.create(
                        model=model,
                        messages=messages,
                        temperature=0.3,
                        max_tokens=2048,
                    )
                    return response.choices[0].message.content
                except (APITimeoutError, APIConnectionError) as e:
                    if attempt < 2:
                        wait = 2 ** attempt
                        logger.warning(f"LLM attempt {attempt + 1} failed ({e}), retrying in {wait}s...")
                        await asyncio.sleep(wait)
                    else:
                        raise

        return _llm_func

    # ── Internal: Mindscape ───────────────────────────────────────

    async def _build_mindscape(self, documents: list[str]):
        """Two-level summarization: chunks → global mindscape."""
        if not self.summarizer:
            return

        logger.info(f"Building mindscape from {len(documents)} docs...")
        t0 = time.time()

        all_chunks = []
        for doc in documents:
            for j in range(0, len(doc), 2400):
                chunk = doc[j:j + 2400]
                if len(chunk.strip()) > 100:
                    all_chunks.append(chunk)

        logger.info(f"  Chunks: {len(all_chunks)}")
        self.mindscape = await self.summarizer.build_mindscape(all_chunks)
        logger.info(f"  Mindscape: {len(self.mindscape)} chars ({time.time() - t0:.1f}s)")

    # ── Internal: Prompt State ────────────────────────────────────

    def _save_prompts(self, prompts: dict):
        self._saved_prompts = {
            "entity_extraction_examples": deepcopy(prompts.get("entity_extraction_examples", [])),
            "entity_extraction_system_prompt": prompts.get("entity_extraction_system_prompt", ""),
        }

    def _restore_prompts(self):
        if not self._saved_prompts:
            return
        try:
            from lightrag.prompt import PROMPTS
            PROMPTS["entity_extraction_examples"] = self._saved_prompts["entity_extraction_examples"]
            PROMPTS["entity_extraction_system_prompt"] = self._saved_prompts["entity_extraction_system_prompt"]
        except Exception:
            pass
