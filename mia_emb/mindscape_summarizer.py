"""
Two-Level Mindscape Summarization Pipeline.

Based on MiA-RAG paper (arXiv:2512.17220):
  1. Chunk-level: summarize each ~1200-token document chunk
  2. Global-level: merge all chunk summaries into a unified mindscape

Uses DeepSeek V3 API (OpenAI-compatible) for cost-effective Chinese legal text summarization.
"""

import asyncio
import logging
from typing import Optional

from openai import AsyncOpenAI

from .mia_config import MiAConfig

logger = logging.getLogger("mia_emb")


CHUNK_SUMMARIZE_SYSTEM = """你是中国法律文书摘要专家。请对以下法律文本片段生成简洁的结构化摘要：

**要求：**
1. 保留关键法条编号（如"第X条"）
2. 提取核心法律要件和法律关系
3. 保留关键主体、行为、后果
4. 1-3句话，中文输出
5. 只输出摘要本身，不要任何前缀或解释"""

GLOBAL_SUMMARIZE_SYSTEM = """你是中国法律知识体系构建专家。以下是多段法律文书的片段摘要，请生成一份**全局心智景观（Mindscape）**摘要：

**要求：**
1. 归纳出覆盖全局的核心法律主题（如：婚姻家庭、侵权责任、合同纠纷等）
2. 列出关键法律概念及其之间的关系
3. 突出跨文档的重要法律原则和规则
4. 用结构化文本输出，控制在500字以内
5. 这个摘要将作为检索的语义指导，请确保信息密度高"""


class MindscapeSummarizer:
    """Two-level summarization pipeline for building document mindscape."""

    def __init__(self, config: MiAConfig):
        self.config = config
        self._client: Optional[AsyncOpenAI] = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=self.config.deepseek_api_key,
                base_url=self.config.deepseek_base_url,
            )
        return self._client

    async def summarize_chunks(
        self,
        chunks: list[str],
        max_concurrent: int = 5,
    ) -> list[str]:
        """Level 1: Summarize individual document chunks.

        Args:
            chunks: List of text chunks (~1200 tokens each).
            max_concurrent: Max concurrent API calls.

        Returns:
            List of chunk-level summaries, one per input chunk.
        """
        semaphore = asyncio.Semaphore(max_concurrent)

        async def summarize_one(chunk: str) -> str:
            async with semaphore:
                return await self._summarize_single(chunk)

        tasks = [summarize_one(chunk) for chunk in chunks]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        summaries = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning(f"Chunk {i} summarization failed: {result}")
                summaries.append(chunks[i][:200])  # fallback: first 200 chars
            else:
                summaries.append(result)
        return summaries

    async def summarize_global(self, chunk_summaries: list[str]) -> str:
        """Level 2: Generate global mindscape from chunk summaries.

        Args:
            chunk_summaries: Output from summarize_chunks().

        Returns:
            A unified mindscape string S used as context signal for MiA-EMB retrieval.
        """
        if not chunk_summaries:
            return ""

        combined = "\n\n---\n\n".join(
            f"[片段{i+1}] {s}" for i, s in enumerate(chunk_summaries)
        )

        if len(combined) > 32000:
            combined = combined[:32000] + "\n...(truncated)"

        try:
            response = await self.client.chat.completions.create(
                model=self.config.deepseek_model,
                messages=[
                    {"role": "system", "content": GLOBAL_SUMMARIZE_SYSTEM},
                    {"role": "user", "content": combined},
                ],
                max_tokens=self.config.global_summary_max_tokens,
                temperature=self.config.summary_temperature,
            )
            content = response.choices[0].message.content
            return content.strip() if content else ""
        except Exception as e:
            logger.error(f"Global summarization failed: {e}")
            # Fallback: concatenate first sentences from chunk summaries
            return "; ".join(s.split("。")[0] for s in chunk_summaries[:10])

    async def build_mindscape(
        self,
        chunks: list[str],
        chunk_summaries: Optional[list[str]] = None,
    ) -> str:
        """Full pipeline: chunk summaries → global mindscape.

        Args:
            chunks: Raw document chunks.
            chunk_summaries: Pre-computed chunk summaries (skips level 1 if provided).

        Returns:
            Global mindscape string S, fed into MiA-EMB as context signal.
        """
        if chunk_summaries is None:
            logger.info(f"Level 1: Summarizing {len(chunks)} chunks...")
            chunk_summaries = await self.summarize_chunks(chunks)

        logger.info("Level 2: Generating global mindscape...")
        mindscape = await self.summarize_global(chunk_summaries)
        logger.info(f"Mindscape built: {len(mindscape)} chars")
        return mindscape

    async def _summarize_single(self, chunk: str) -> str:
        """Summarize a single chunk via DeepSeek V3."""
        truncated = chunk[:6000]
        response = await self.client.chat.completions.create(
            model=self.config.deepseek_model,
            messages=[
                {"role": "system", "content": CHUNK_SUMMARIZE_SYSTEM},
                {"role": "user", "content": truncated},
            ],
            max_tokens=self.config.chunk_summary_max_tokens,
            temperature=self.config.summary_temperature,
        )
        content = response.choices[0].message.content
        return content.strip() if content else truncated[:100]
