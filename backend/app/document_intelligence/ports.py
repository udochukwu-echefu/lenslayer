from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Mapping, Protocol, Sequence, TypedDict


class VersionComparison(TypedDict):
    compared_to_version_id: str | None
    added: list[str]
    removed: list[str]
    changed_summary: str
    added_count: int
    removed_count: int


@dataclass(frozen=True)
class ExtractionResult:
    text: str
    chunks: Sequence[Any]
    quality: dict[str, Any]


@dataclass(frozen=True)
class QASource:
    label: str
    location: str
    excerpt: str
    contract_id: str | None = None
    contract_title: str | None = None


@dataclass(frozen=True)
class QAResult:
    answer: str
    sources: list[QASource]
    generated_by: Literal["model", "extractive"]


@dataclass(frozen=True)
class PortfolioDocument:
    contract_id: str
    title: str
    text: str


class DocumentExtractor(Protocol):
    def extract(self, path: str | Path) -> ExtractionResult: ...


class UploadedTextExtractor(Protocol):
    def extract(self, filename: str, data: bytes) -> str: ...


class ContractAnalyzer(Protocol):
    def analyze(
        self,
        text: str,
        review_context: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]: ...


class VersionComparator(Protocol):
    def compare(
        self,
        original: str,
        revised: str,
        previous_id: str | None,
    ) -> VersionComparison: ...


class ContractQuestionAnswerer(Protocol):
    def answer(
        self,
        source_text: str,
        question: str,
        review_context: Mapping[str, Any] | None = None,
    ) -> QAResult: ...


class PortfolioQuestionAnswerer(Protocol):
    def answer(
        self,
        documents: Sequence[PortfolioDocument],
        question: str,
    ) -> QAResult: ...


class PlaybookEvaluator(Protocol):
    def evaluate(self, report: dict[str, Any]) -> dict[str, Any]: ...
