"""Closed product-provider registry. Never read subscription credentials or env files."""
from dataclasses import dataclass


class HostedModelError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class Provider:
    name: str
    model: str
    responses_url: str
    models_url: str


OPENAI = Provider("openai", "gpt-6.1-sol", "https://api.openai.com/v1/responses", "https://api.openai.com/v1/models")
DEEPSEEK = Provider("deepseek", "deepseek-flash", "https://api.deepseek.com/responses", "https://api.deepseek.com/models")


def select_provider(name):
    if name == "openai":
        return OPENAI
    if name == "deepseek":
        return DEEPSEEK
    raise HostedModelError("model_provider_unavailable")
