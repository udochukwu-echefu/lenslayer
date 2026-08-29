from __future__ import annotations

import difflib
import os
import re
import tempfile
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

from .ports import ExtractionResult, PortfolioDocument, QAResult, QASource, VersionComparison


QUESTION_STOP_WORDS = {
    "about", "what", "when", "where", "which", "that", "this", "with", "from", "does", "have",
}


def _question_tokens(question: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-z0-9]{3,}", question.casefold())
        if token not in QUESTION_STOP_WORDS
    }


def _source_location(block: str, index: int) -> str:
    match = re.search(r"\[(PAGE \d+|L\d+)\]", block, flags=re.IGNORECASE)
    return match.group(1).title() if match else f"Retained excerpt {index}"


class AnalyzerDocumentExtractor:
    def __init__(self, parser: Callable[[str], tuple[str, Sequence[Any], dict[str, Any]]] | None = None):
        self._parser = parser

    def extract(self, path: str | Path) -> ExtractionResult:
        if self._parser is None:
            from analyzer import parse_document

            parser = parse_document
        else:
            parser = self._parser
        text, chunks, quality = parser(str(path))
        return ExtractionResult(text=text, chunks=chunks, quality=quality)


class AnalyzerUploadedTextExtractor:
    def __init__(self, document_extractor: AnalyzerDocumentExtractor):
        self._document_extractor = document_extractor

    def extract(self, filename: str, data: bytes) -> str:
        suffix = Path(filename).suffix.lower()
        if suffix == ".txt":
            return data.decode("utf-8", errors="replace")
        temp_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
                handle.write(data)
                temp_path = handle.name
            return self._document_extractor.extract(temp_path).text
        finally:
            if temp_path:
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass


class AnalyzerContractAnalyzer:
    def __init__(self, analyzer: Callable[[str, Mapping[str, Any] | None], dict[str, Any]] | None = None):
        self._analyzer = analyzer

    def analyze(
        self,
        text: str,
        review_context: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        if self._analyzer is None:
            from analyzer import analyze_contract

            analyzer = analyze_contract
        else:
            analyzer = self._analyzer
        return analyzer(text, dict(review_context or {}))


class DefaultPlaybookEvaluator:
    def evaluate(self, report: dict[str, Any]) -> dict[str, Any]:
        from playbooks import DEFAULT_PLAYBOOK, evaluate_report

        return evaluate_report(report, DEFAULT_PLAYBOOK)


class DeterministicVersionComparator:
    def compare(
        self,
        original: str,
        revised: str,
        previous_id: str | None,
    ) -> VersionComparison:
        old_lines = [line.strip() for line in original.splitlines() if line.strip()]
        new_lines = [line.strip() for line in revised.splitlines() if line.strip()]
        added: list[str] = []
        removed: list[str] = []
        for line in difflib.ndiff(old_lines, new_lines):
            if line.startswith("+ "):
                added.append(line[2:])
            elif line.startswith("- "):
                removed.append(line[2:])
        if not old_lines:
            summary = "No retained prior text was available for comparison."
        elif not added and not removed:
            summary = "No substantive line-level changes detected."
        else:
            count = len(added) + len(removed)
            summary = f"{len(added)} added and {len(removed)} removed line-level change{'s' if count != 1 else ''} detected."
        return {
            "compared_to_version_id": previous_id,
            "added": added[:50],
            "removed": removed[:50],
            "changed_summary": summary,
            "added_count": len(added),
            "removed_count": len(removed),
        }


class RetainedTextQuestionAnswerer:
    def __init__(
        self,
        model_factory: Callable[[], Any] | None = None,
        model_enabled: Callable[[], bool] | None = None,
    ):
        self._model_factory = model_factory
        self._model_enabled = model_enabled or (lambda: bool(os.environ.get("GROQ_API_KEY")))

    def answer(
        self,
        source_text: str,
        question: str,
        review_context: Mapping[str, Any] | None = None,
    ) -> QAResult:
        tokens = _question_tokens(question)
        blocks = [item.strip() for item in re.split(r"\n{2,}", source_text) if item.strip()]
        scored = [
            (sum(block.casefold().count(token) for token in tokens), -index, block)
            for index, block in enumerate(blocks)
        ]
        selected = [item[2] for item in sorted(scored, reverse=True)[:4] if item[0] > 0] or blocks[:3]
        sources = [
            QASource(
                label=f"Source {index}",
                location=_source_location(block, index),
                excerpt=" ".join(block.split())[:900],
            )
            for index, block in enumerate(selected, start=1)
        ]
        if not sources:
            return QAResult(answer="", sources=[], generated_by="extractive")

        if self._model_enabled():
            from analyzer import get_llm, review_context_text

            model = self._model_factory() if self._model_factory else get_llm()
            evidence = "\n\n".join(
                f"[{source.label}] {source.location}\n{source.excerpt}" for source in sources
            )
            prompt = (
                "Answer this contract question using only the evidence below. Cite sources inline as "
                "[Source 1]. If the evidence does not establish the answer, say so. Use plain language "
                "and distinguish document facts from suggested next steps. This is first-pass education, "
                "not legal advice.\n\n"
                f"REVIEW CONTEXT\n{review_context_text(dict(review_context or {}))}\n\n"
                f"QUESTION\n{question.strip()}\n\nEVIDENCE\n{evidence}"
            )
            answer = str(model.invoke(prompt).content).strip()
            generated_by = "model"
        else:
            answer = (
                "The most relevant retained excerpts are shown below. A model answer is unavailable in this "
                "environment, so confirm the wording directly in the document before acting."
            )
            generated_by = "extractive"
        return QAResult(answer=answer, sources=sources, generated_by=generated_by)


class PortfolioEvidenceQuestionAnswerer:
    def __init__(
        self,
        model_factory: Callable[[], Any] | None = None,
        model_enabled: Callable[[], bool] | None = None,
    ):
        self._model_factory = model_factory
        self._model_enabled = model_enabled or (lambda: bool(os.environ.get("GROQ_API_KEY")))

    def answer(self, documents: Sequence[PortfolioDocument], question: str) -> QAResult:
        tokens = _question_tokens(question)
        candidates: list[tuple[int, PortfolioDocument, str, str]] = []
        for document in documents:
            blocks = [item.strip() for item in re.split(r"\n{2,}", document.text) if item.strip()]
            for index, block in enumerate(blocks[:80]):
                score = sum(block.casefold().count(token) for token in tokens)
                if score:
                    candidates.append((score, document, f"Excerpt {index + 1}", " ".join(block.split())[:900]))
        selected = sorted(candidates, key=lambda item: item[0], reverse=True)[:8]
        sources = [
            QASource(
                label=f"Source {index}",
                location=location,
                excerpt=excerpt,
                contract_id=document.contract_id,
                contract_title=document.title,
            )
            for index, (_, document, location, excerpt) in enumerate(selected, 1)
        ]
        if not sources:
            return QAResult(
                answer="No retained contract evidence matched that question.",
                sources=[],
                generated_by="extractive",
            )

        if self._model_enabled():
            from analyzer import get_llm

            model = self._model_factory() if self._model_factory else get_llm()
            evidence = "\n\n".join(
                f"[{source.label}] {source.contract_title}, {source.location}\n{source.excerpt}"
                for source in sources
            )
            prompt = (
                "Answer the portfolio question using only the evidence below. Cite [Source 1] inline, "
                "name the relevant contract, and say when evidence is insufficient. This is operational "
                "contract triage, not legal advice.\n\n"
                f"QUESTION\n{question}\n\nEVIDENCE\n{evidence}"
            )
            answer = str(model.invoke(prompt).content).strip()
            generated_by = "model"
        else:
            answer = (
                f"Found relevant evidence across {len({source.contract_id for source in sources})} contract(s). "
                "Review the cited excerpts below before acting."
            )
            generated_by = "extractive"
        return QAResult(answer=answer, sources=sources, generated_by=generated_by)
