from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from .ports import (
    ContractAnalyzer,
    ContractQuestionAnswerer,
    DocumentExtractor,
    ExtractionResult,
    PlaybookEvaluator,
    PortfolioDocument,
    PortfolioQuestionAnswerer,
    QAResult,
    UploadedTextExtractor,
    VersionComparator,
    VersionComparison,
)


class ReviewWorkflow:
    """Pure orchestration for extraction, analysis, comparison, and evidence Q&A."""

    def __init__(
        self,
        *,
        extractor: DocumentExtractor,
        uploaded_text_extractor: UploadedTextExtractor,
        analyzer: ContractAnalyzer,
        comparator: VersionComparator,
        contract_qa: ContractQuestionAnswerer,
        portfolio_qa: PortfolioQuestionAnswerer,
        playbook: PlaybookEvaluator,
    ):
        self._extractor = extractor
        self._uploaded_text_extractor = uploaded_text_extractor
        self._analyzer = analyzer
        self._comparator = comparator
        self._contract_qa = contract_qa
        self._portfolio_qa = portfolio_qa
        self._playbook = playbook

    def extract_document(self, path: str | Path) -> ExtractionResult:
        extraction = self._extractor.extract(path)
        if not extraction.text.strip():
            raise ValueError("No readable text was found in the document.")
        return extraction

    def analyze_contract(
        self,
        text: str,
        review_context: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        report = self._analyzer.analyze(text, review_context)
        report["playbook_evaluation"] = self._playbook.evaluate(report)
        return report

    def review_document(
        self,
        path: str | Path,
        review_context: Mapping[str, Any] | None = None,
    ) -> tuple[ExtractionResult, dict[str, Any]]:
        extraction = self.extract_document(path)
        return extraction, self.analyze_contract(extraction.text, review_context)

    def extract_uploaded_text(self, filename: str, data: bytes) -> str:
        return self._uploaded_text_extractor.extract(filename, data)

    def compare_version(
        self,
        original: str,
        revised: str,
        previous_id: str | None,
    ) -> VersionComparison:
        return self._comparator.compare(original, revised, previous_id)

    def answer_contract(
        self,
        source_text: str,
        question: str,
        review_context: Mapping[str, Any] | None = None,
    ) -> QAResult:
        return self._contract_qa.answer(source_text, question, review_context)

    def answer_portfolio(
        self,
        documents: Sequence[PortfolioDocument],
        question: str,
    ) -> QAResult:
        return self._portfolio_qa.answer(documents, question)
