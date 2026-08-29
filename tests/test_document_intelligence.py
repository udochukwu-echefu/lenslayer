import unittest

from backend.app.document_intelligence import ExtractionResult, PortfolioDocument, ReviewWorkflow
from backend.app.document_intelligence.adapters import (
    AnalyzerUploadedTextExtractor,
    DeterministicVersionComparator,
    PortfolioEvidenceQuestionAnswerer,
    RetainedTextQuestionAnswerer,
)
from backend.app.services import PlatformService
from backend.app.service_domains.interfaces import DomainDependencies


class StubExtractor:
    def __init__(self, text="Agreement text"):
        self.text = text

    def extract(self, path):
        return ExtractionResult(self.text, ["chunk"], {"quality": "good"})


class StubUploadedTextExtractor:
    def extract(self, filename, data):
        return data.decode()


class StubAnalyzer:
    def analyze(self, text, review_context=None):
        return {"title": "Reviewed", "context": dict(review_context or {})}


class StubPlaybook:
    def evaluate(self, report):
        return {"evaluated_title": report["title"]}


class StubQA:
    def answer(self, *args, **kwargs):
        return RetainedTextQuestionAnswerer(model_enabled=lambda: False).answer(*args, **kwargs)


class StubPortfolioQA:
    def answer(self, documents, question):
        return PortfolioEvidenceQuestionAnswerer(model_enabled=lambda: False).answer(documents, question)


def workflow(extractor=None):
    return ReviewWorkflow(
        extractor=extractor or StubExtractor(),
        uploaded_text_extractor=StubUploadedTextExtractor(),
        analyzer=StubAnalyzer(),
        comparator=DeterministicVersionComparator(),
        contract_qa=StubQA(),
        portfolio_qa=StubPortfolioQA(),
        playbook=StubPlaybook(),
    )


class DocumentIntelligenceTests(unittest.TestCase):
    def test_review_workflow_orchestrates_ports_without_provider_details(self):
        extraction, report = workflow().review_document("agreement.pdf", {"party_role": "Customer"})

        self.assertEqual(extraction.quality, {"quality": "good"})
        self.assertEqual(report["context"], {"party_role": "Customer"})
        self.assertEqual(report["playbook_evaluation"], {"evaluated_title": "Reviewed"})

    def test_review_workflow_rejects_empty_extraction(self):
        with self.assertRaisesRegex(ValueError, "No readable text"):
            workflow(StubExtractor("  ")).extract_document("empty.pdf")

    def test_deterministic_comparison_preserves_live_version_semantics(self):
        comparison = workflow().compare_version("Line one\nLine two", "Line one\nLine three", "v1")

        self.assertEqual(comparison["compared_to_version_id"], "v1")
        self.assertEqual(comparison["added"], ["Line three"])
        self.assertEqual(comparison["removed"], ["Line two"])

    def test_contract_and_portfolio_qa_return_cited_extracts_without_a_model(self):
        contract_result = workflow().answer_contract(
            "[PAGE 2]\nThe agreement renews annually after sixty days notice.",
            "When does the agreement renew?",
            {},
        )
        portfolio_result = workflow().answer_portfolio(
            [PortfolioDocument("c1", "Supplier agreement", "Renewal notice is sixty days.")],
            "What is the renewal notice?",
        )

        self.assertEqual(contract_result.generated_by, "extractive")
        self.assertEqual(contract_result.sources[0].location, "Page 2")
        self.assertEqual(portfolio_result.sources[0].contract_id, "c1")

    def test_uploaded_text_adapter_preserves_raw_txt_revision_behavior(self):
        extractor = AnalyzerUploadedTextExtractor(StubExtractor("line-numbered"))

        self.assertEqual(extractor.extract("revision.txt", b"raw revision"), "raw revision")
        self.assertEqual(extractor.extract("revision.pdf", b"pdf bytes"), "line-numbered")

    def test_domain_collaborators_can_be_substituted_independently(self):
        class ContractAccess:
            pass

        class WorkspaceAccess:
            def require_roles(self, organization_id, user, allowed, detail):
                return organization_id, user, allowed, detail

        class IntegrationAccess:
            def _enqueue_webhooks(self, organization_id, event_type, contract_id, payload):
                return organization_id, event_type, contract_id, payload

        contract_access = ContractAccess()
        workspace_access = WorkspaceAccess()
        integration_access = IntegrationAccess()
        service = PlatformService(
            object(),
            object(),
            object(),
            workflow(),
            DomainDependencies(
                workspace=workspace_access,
                contracts=contract_access,
                integrations=integration_access,
            ),
        )

        self.assertIs(service.contracts, contract_access)
        self.assertEqual(
            service.workspace.require_roles("org", "user", {"owner"}, "detail"),
            ("org", "user", {"owner"}, "detail"),
        )
        self.assertEqual(
            service.integrations._enqueue_webhooks("org", "contract.created", "c1", {"id": "c1"}),
            ("org", "contract.created", "c1", {"id": "c1"}),
        )

    def test_platform_service_is_composed_from_product_domain_modules(self):
        modules = {base.__module__ for base in PlatformService.__mro__}

        self.assertIn("backend.app.service_domains.workspace", modules)
        self.assertIn("backend.app.service_domains.contracts", modules)
        self.assertIn("backend.app.service_domains.integrations", modules)
        self.assertIn("backend.app.service_domains.governance", modules)


if __name__ == "__main__":
    unittest.main()
