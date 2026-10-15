"""Bounded Responses protocol; no raw payloads in public results/errors."""
import json
import time

import httpx

from .hosted_model_providers import HostedModelError

MAX_REQUEST_BYTES = 32768
MAX_RESPONSE_BYTES = 65536
MAX_OUTPUT_TOKENS = 4096


def strict_json(value):
    def pairs(items):
        result = {}
        for key, item in items:
            if key in result:
                raise ValueError()
            result[key] = item
        return result
    def invalid(_):
        raise ValueError()
    return json.loads(value, object_pairs_hook=pairs, parse_constant=invalid)


def bounded_json(method, url, key, *, body=None, timeout=30, transport=None):
    if not isinstance(key, str) or not key.strip() or any(c.isspace() for c in key):
        raise HostedModelError("model_credential_invalid")
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 0 < timeout <= 30:
        raise HostedModelError("model_limits_invalid")
    wire = None if body is None else json.dumps(body, ensure_ascii=True, allow_nan=False).encode()
    if wire is not None and len(wire) > MAX_REQUEST_BYTES:
        raise HostedModelError("model_input_too_large")
    started = time.monotonic()
    try:
        with httpx.Client(timeout=timeout, transport=transport, follow_redirects=False, trust_env=False) as client:
            with client.stream(method, url, headers={"Authorization": "Bearer " + key,
                    "Content-Type": "application/json", "Accept-Encoding": "identity"}, content=wire) as response:
                if response.status_code != 200:
                    raise HostedModelError("model_request_failed")
                if response.headers.get("content-encoding", "identity") != "identity":
                    raise HostedModelError("model_response_invalid")
                chunks, size = [], 0
                # Do not aggregate 8192 bytes before checking the deadline: a slow
                # drip can keep each socket read alive indefinitely otherwise.
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > MAX_RESPONSE_BYTES or time.monotonic() - started > timeout * 2:
                        raise HostedModelError("model_response_invalid")
                    chunks.append(chunk)
                return strict_json(b"".join(chunks))
    except httpx.HTTPError:
        raise HostedModelError("model_outcome_unknown") from None
    except (ValueError, TypeError, RecursionError):
        raise HostedModelError("model_response_invalid") from None


def decision_text(data, provider):
    try:
        if (not isinstance(data, dict) or data.get("status") != "completed" or data.get("model") != provider.model
                or data.get("error") is not None or data.get("incomplete_details") is not None):
            raise ValueError()
        output = data["output"]
        if not isinstance(output, list) or not 1 <= len(output) <= 8:
            raise ValueError()
        texts = []
        messages = 0
        for item in output:
            if not isinstance(item, dict):
                raise ValueError()
            if item.get("type") == "reasoning":
                if item.get("status", "completed") != "completed":
                    raise ValueError()
                continue  # discard ALL reasoning/summary content
            if item.get("type") != "message" or item.get("role") != "assistant" or item.get("status") != "completed":
                raise ValueError()
            messages += 1
            content = item["content"]
            if not isinstance(content, list) or len(content) != 1:
                raise ValueError()
            part = content[0]
            if not isinstance(part, dict) or part.get("type") != "output_text" or not isinstance(part.get("text"), str):
                raise ValueError()
            texts.append(part["text"])
        if messages != 1 or len(texts) != 1 or not 0 < len(texts[0]) <= 512:
            raise ValueError()
        parsed = strict_json(texts[0])
        if not isinstance(parsed, dict) or set(parsed) != {"decision"} or parsed["decision"] not in ("proceed", "needs_input", "decline"):
            raise ValueError()
        return parsed
    except (ValueError, KeyError, TypeError, AttributeError, RecursionError):
        raise HostedModelError("model_response_invalid") from None


def verify_deepseek(key, *, timeout=30, transport=None):
    """Positive discovery, including version and published context/effort bounds."""
    from .hosted_model_providers import DEEPSEEK
    data = bounded_json("GET", DEEPSEEK.models_url, key, timeout=timeout, transport=transport)
    try:
        if not isinstance(data, dict) or data.get("object") != "list" or not isinstance(data.get("data"), list):
            raise ValueError()
        matches = [item for item in data["data"] if isinstance(item, dict) and item.get("id") == DEEPSEEK.model]
        if len(matches) != 1:
            raise ValueError()
        item = matches[0]
        levels = item["effort"]["supported_levels"]
        inputs, outputs = item["input_modalities"], item["output_modalities"]
        if any(not isinstance(values, list) or any(not isinstance(value, str) for value in values)
               for values in (levels, inputs, outputs)):
            raise ValueError()
        if (item.get("object") != "model" or item.get("name") != "DeepSeek-V4.1-Flash"
                or type(item.get("context_window")) is not int or not 4096 <= item["context_window"] <= 1048576
                or type(item.get("max_output_tokens")) is not int or item["max_output_tokens"] < MAX_OUTPUT_TOKENS
                or "high" not in levels or "text" not in inputs or "text" not in outputs):
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HostedModelError("model_unavailable") from None
    return {"provider": DEEPSEEK.name, "model": DEEPSEEK.model, "version": "DeepSeek-V4.1-Flash"}
