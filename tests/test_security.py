import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

from backend.app.config import Settings
from backend.app.security import _jwks_client, _oidc_principal


class OidcPrincipalTests(unittest.TestCase):
    def setUp(self):
        _jwks_client.cache_clear()
        self.settings = Settings(
            _env_file=None,
            auth_mode="oidc",
            oidc_issuer="https://tenant.auth0.com/",
            oidc_audience="https://api.lenslayer.example",
            oidc_jwks_url="https://tenant.auth0.com/.well-known/jwks.json",
            oidc_email_claim="https://lenslayer.app/email",
            oidc_name_claim="https://lenslayer.app/name",
            oidc_email_verified_claim="https://lenslayer.app/email_verified",
            oidc_require_verified_email=True,
        )
        self.request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/",
                "headers": [(b"authorization", b"Bearer access-token")],
            }
        )

    def principal_for(self, claims):
        with patch("jwt.PyJWKClient") as jwks_client, patch("jwt.decode", return_value=claims):
            jwks_client.return_value.get_signing_key_from_jwt.return_value.key = "public-key"
            return _oidc_principal(self.request, self.settings)

    def test_reads_configured_auth0_identity_claims(self):
        principal = self.principal_for(
            {
                "sub": "auth0|123",
                "https://lenslayer.app/email": " Owner@Example.com ",
                "https://lenslayer.app/name": "Workspace Owner",
                "https://lenslayer.app/email_verified": True,
            }
        )

        self.assertEqual(principal.subject, "auth0|123")
        self.assertEqual(principal.email, "owner@example.com")
        self.assertEqual(principal.display_name, "Workspace Owner")

    def test_rejects_unverified_email_when_required(self):
        with self.assertRaises(HTTPException) as error:
            self.principal_for(
                {
                    "sub": "auth0|123",
                    "https://lenslayer.app/email": "owner@example.com",
                    "https://lenslayer.app/email_verified": False,
                }
            )

        self.assertEqual(error.exception.status_code, 403)

    def test_rejects_tokens_without_an_email(self):
        with self.assertRaises(HTTPException) as error:
            self.principal_for({"sub": "auth0|123", "https://lenslayer.app/email_verified": True})

        self.assertEqual(error.exception.status_code, 401)

    def test_reuses_the_jwks_client_across_requests(self):
        claims = {
            "sub": "auth0|123",
            "https://lenslayer.app/email": "owner@example.com",
            "https://lenslayer.app/email_verified": True,
        }
        with patch("jwt.PyJWKClient") as jwks_client, patch("jwt.decode", return_value=claims):
            jwks_client.return_value.get_signing_key_from_jwt.return_value.key = "public-key"
            _oidc_principal(self.request, self.settings)
            _oidc_principal(self.request, self.settings)

        jwks_client.assert_called_once()
        self.assertEqual(jwks_client.return_value.get_signing_key_from_jwt.call_count, 2)


if __name__ == "__main__":
    unittest.main()
