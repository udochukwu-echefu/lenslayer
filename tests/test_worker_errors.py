from backend.app.worker import public_review_error


def test_public_review_error_hides_provider_model_details():
    error = RuntimeError(
        "Error code: 404 - model `llama-3.3-70b-versatile` does not exist; code: model_not_found"
    )

    message = public_review_error(error)

    assert message == "The document analysis service is temporarily unavailable. Please retry shortly."
    assert "llama" not in message.lower()
    assert "404" not in message


def test_public_review_error_has_safe_generic_fallback():
    message = public_review_error(RuntimeError("secret upstream response"))

    assert message == "The review could not be completed. Please retry or contact support."
    assert "upstream" not in message
