from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from .adapters import (
    AnalyzerContractAnalyzer,
    AnalyzerDocumentExtractor,
    AnalyzerUploadedTextExtractor,
    DefaultPlaybookEvaluator,
    DeterministicVersionComparator,
    PortfolioEvidenceQuestionAnswerer,
    RetainedTextQuestionAnswerer,
)
from .ports import ExtractionResult, PortfolioDocument, QAResult, QASource, VersionComparison
from .workflow import ReviewWorkflow


def build_review_workflow(
    *,
    document_parser: Callable[[str], tuple[str, Sequence[Any], dict[str, Any]]] | None = None,
    contract_analyzer: Callable[[str, Mapping[str, Any] | None], dict[str, Any]] | None = None,
) -> ReviewWorkflow:
    extractor = AnalyzerDocumentExtractor(document_parser)
    return ReviewWorkflow(
        extractor=extractor,
        uploaded_text_extractor=AnalyzerUploadedTextExtractor(extractor),
        analyzer=AnalyzerContractAnalyzer(contract_analyzer),
        comparator=DeterministicVersionComparator(),
        contract_qa=RetainedTextQuestionAnswerer(),
        portfolio_qa=PortfolioEvidenceQuestionAnswerer(),
        playbook=DefaultPlaybookEvaluator(),
    )


__all__ = [
    "ExtractionResult",
    "PortfolioDocument",
    "QAResult",
    "QASource",
    "ReviewWorkflow",
    "VersionComparison",
    "build_review_workflow",
]
