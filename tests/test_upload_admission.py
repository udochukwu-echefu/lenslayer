"""Pre-parser admission: real multipart bodies, bounded backlog, no RSS guess."""
import asyncio
from unittest.mock import patch

import anyio

from backend.app.api.dependencies import read_upload
from tests.test_upload_concurrency import UploadConcurrencyTests, Gate


class UploadAdmissionTests(UploadConcurrencyTests):
    async def test_saturation_bounds_materialized_bodies_and_waiters_for_every_upload_route(self):
        original = await self.upload(data={"retain_document": "true"})
        key = await self.client.post(f"{self.base}/api-keys", headers=self.headers,
            json={"name": "Synthetic", "scopes": ["contracts:write"]})
        routes = [
            (f"{self.base}/contracts", self.headers, "contracts", 202),
            (f"{self.base}/intake/email", self.headers, "integrations", 202),
            (f"{self.base}/integrations/google-drive/imports", self.headers, "integrations", 202),
            (f"{self.base}/integrations/dropbox/imports", self.headers, "integrations", 202),
            ("/api/v1/public/contracts", {"Authorization": f"Bearer {key.json()['token']}"}, "public_api", 202),
            (f"{self.base}/contracts/{original.json()['contract']['id']}/versions", self.headers, "negotiation", 201),
        ]
        # 2 MiB forces Starlette's default 1 MiB per-file spool onto disk. Only
        # admitted files may reach even that parser, let alone endpoint bytes.
        payload = b"Synthetic notice clause. " * 87382
        for path, headers, module, expected in routes:
            with self.subTest(path=path):
                gate, buffered, spooled = Gate(target=2), [], []
                async def counted(file, maximum):
                    spooled.append(bool(getattr(file.file, "_rolled", False)))
                    data = await read_upload(file, maximum)
                    buffered.append(len(data))
                    return data
                scanner = "negotiation" if module == "negotiation" else "contracts"
                # Large-body memory/admission is the workload, not quadratic
                # difflib over repetitive megabytes in version comparison.
                with patch(f"backend.app.api.{module}.read_upload", counted), patch(f"backend.app.service_domains.{scanner}.scan_upload", gate), patch("backend.app.service_domains.negotiation.NegotiationServiceMixin._extract_uploaded_text", return_value="Synthetic version"):
                    tasks = [asyncio.create_task(self.upload(path, headers=headers, content=payload + str(i).encode(), data={"external_id": f"fixture-{i}"})) for i in range(20)]
                    try:
                        await gate.wait()
                        with anyio.fail_after(3):
                            while sum(t.done() for t in tasks) < 14:
                                await asyncio.sleep(0.001)
                        self.assertEqual(len(buffered), 2)
                        self.assertEqual(spooled, [True, True])
                        self.assertEqual(self.app.state.upload_limiter.statistics().tasks_waiting, 4)
                        overloaded = [t.result() for t in tasks if t.done()]
                        self.assertTrue(all(r.status_code == 503 and r.headers.get("retry-after") == "2" for r in overloaded))
                        denied = await asyncio.wait_for(self.upload(headers={"Authorization": "Bearer ll_agent_denied"}), 1)
                        self.assertEqual(denied.status_code, 401)
                        response = await asyncio.wait_for(self.client.get(f"{self.base}/contracts", headers=self.headers), 1)
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(gate.calls, 2)
                    finally:
                        gate.release.set()
                        responses = await asyncio.gather(*tasks)
                    # Concurrent version numbers can legitimately conflict; no
                    # hidden replay or weakening of that existing boundary.
                    self.assertEqual(sum(r.status_code in {expected, 409} for r in responses), 6, [(r.status_code, r.text[:150]) for r in responses])
                    self.assertEqual(sum(r.status_code == 503 for r in responses), 14)
                    self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 0)
                    self.assertEqual(self.app.state.upload_limiter.statistics().tasks_waiting, 0)

    async def test_queued_cancellation_does_not_parse_or_materialize(self):
        self.settings.upload_concurrency = 1
        gate, reads = Gate(), []
        async def counted(file, maximum):
            reads.append(file)
            return await read_upload(file, maximum)
        with patch("backend.app.api.contracts.read_upload", counted), patch("backend.app.service_domains.contracts.scan_upload", gate):
            active = asyncio.create_task(self.upload())
            await gate.wait()
            queued = asyncio.create_task(self.upload())
            try:
                with anyio.fail_after(2):
                    while self.app.state.upload_limiter.statistics().tasks_waiting != 1:
                        await asyncio.sleep(0.001)
                queued.cancel()
                await asyncio.gather(queued, return_exceptions=True)
                self.assertEqual(len(reads), 1)
            finally:
                gate.release.set()
                self.assertEqual((await active).status_code, 202)
            self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 0)
