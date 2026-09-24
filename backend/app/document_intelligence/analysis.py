"""Model configuration and structured contract analysis."""
import json
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

from .prompts import CONTRACT_ANALYSIS_PROMPT

load_dotenv(Path(__file__).resolve().parents[3] / ".env")


def review_context_text(context):
    context = context or {}
    return "\n".join(
        [
            f"User's party: {context.get('party_role') or 'Not specified'}",
            f"Jurisdiction or governing law: {context.get('jurisdiction') or 'Not specified'}",
            f"Review goal: {context.get('goal') or 'Understand before signing'}",
            f"Risk tolerance: {context.get('risk_tolerance') or 'Balanced'}",
        ]
    )


@lru_cache(maxsize=1)
def get_llm():
    from langchain_openai import ChatOpenAI

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is missing. Add it to the server environment or local .env file.")
    return ChatOpenAI(
        model=os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"),
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
        temperature=0.1,
        max_tokens=int(os.environ.get("GROQ_MAX_TOKENS", "8192")),
        timeout=90,
        max_retries=2,
    )


def analyze_contract(text, review_context=None):
    llm = get_llm()
    json_llm = llm.bind(response_format={"type": "json_object"})
    response = (CONTRACT_ANALYSIS_PROMPT | json_llm).invoke(
        {
            "contract_text": text[:120_000],
            "review_context": review_context_text(review_context),
        }
    )
    try:
        return json.loads(response.content)
    except json.JSONDecodeError as exc:
        raise ValueError("The model returned an incomplete report. Please retry the analysis.") from exc
