"""Pre-parser admission: real multipart bodies, bounded backlog, no RSS guess."""
import asyncio
import json
from pathlib import Path
import subprocess
from unittest.mock import patch

import anyio

from backend.app.api.dependencies import read_upload
from starlette.formparsers import MultiPartParser
from tests import test_upload_concurrency as fixtures
from tests.test_upload_concurrency import Gate


class UploadAdmissionTests(fixtures.UploadConcurrencyTests):
    async def test_cancellation_during_partial_multipart_parse_closes_spool_and_slot(self):
        from starlette import formparsers
        files, arrived, release = [], asyncio.Event(), asyncio.Event()
        real_spool = formparsers.SpooledTemporaryFile
        def spool(*args, **kwargs):
            file = real_spool(*args, **kwargs)
            files.append(file)
            return file
        class PartialBody:
            def __aiter__(self):
                return self.generate()
            async def generate(self):
                yield b'--fixture\r\nContent-Disposition: form-data; name="file"; filename="fake.txt"\r\nContent-Type: text/plain\r\n\r\n' + b"Synthetic" * 150000
                arrived.set()
                await release.wait()
                yield b"\r\n--fixture--\r\n"
        with patch.object(formparsers, "SpooledTemporaryFile", spool):
            task = asyncio.create_task(self.client.post(f"{self.base}/contracts", headers={**self.headers, "Content-Type": "multipart/form-data; boundary=fixture"}, content=PartialBody()))
            try:
                await asyncio.wait_for(arrived.wait(), 2)
                self.assertEqual(len(files), 1)
                self.assertFalse(files[0].closed)
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
                self.assertTrue(files[0].closed)
                self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 0)
            finally:
                release.set()
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        await self.assert_no_upload_artifacts()

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
        records = []
        for path, headers, module, expected in routes:
            with self.subTest(path=path):
                gate, buffered, spooled, parsers = Gate(target=2), [], [], []
                parse = MultiPartParser.parse
                async def counted_parse(parser):
                    parsers.append(parser)
                    return await parse(parser)
                async def counted(file, maximum):
                    spooled.append(bool(getattr(file.file, "_rolled", False)))
                    data = await read_upload(file, maximum)
                    buffered.append(len(data))
                    return data
                scanner = "negotiation" if module == "negotiation" else "contracts"
                # Large-body memory/admission is the workload, not quadratic
                # difflib over repetitive megabytes in version comparison.
                with patch(f"backend.app.api.{module}.read_upload", counted), patch.object(MultiPartParser, "parse", counted_parse), patch(f"backend.app.service_domains.{scanner}.scan_upload", gate), patch("backend.app.service_domains.negotiation.NegotiationServiceMixin._extract_uploaded_text", return_value="Synthetic version"):
                    tasks = [asyncio.create_task(self.upload(path, headers=headers, content=payload + str(i).encode(), data={"external_id": f"fixture-{i}"})) for i in range(20)]
                    try:
                        await gate.wait()
                        with anyio.fail_after(3):
                            while sum(t.done() for t in tasks) < 14:
                                await asyncio.sleep(0.001)
                        self.assertEqual(len(buffered), 2)
                        self.assertEqual(len(parsers), 2)
                        self.assertEqual(spooled, [True, True])
                        self.assertEqual(self.app.state.upload_limiter.statistics().tasks_waiting, 4)
                        overloaded = [t.result() for t in tasks if t.done()]
                        self.assertTrue(all(r.status_code == 503 and r.headers.get("retry-after") == "2" for r in overloaded))
                        denied = await asyncio.wait_for(self.upload(headers={"Authorization": "Bearer ll_agent_denied"}), 1)
                        self.assertEqual(denied.status_code, 401)
                        outsider = await asyncio.wait_for(self.upload(headers={"X-LensLayer-User": "outsider"}), 1)
                        self.assertEqual(outsider.status_code, 403)
                        self.assertEqual(len(parsers), 2)
                        response = await asyncio.wait_for(self.client.get(f"{self.base}/contracts", headers=self.headers), 1)
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(gate.calls, 2)
                        records.append({"route": path.replace(self.organization_id, "synthetic-org").replace(original.json()["contract"]["id"], "synthetic-contract"),
                            "capacity": 2, "requests": 20, "fully_materialized": len(buffered), "materialized_bytes": sum(buffered),
                            "spooled_files": sum(spooled), "waiters_before_parse": 4, "overload_responses": len(overloaded),
                            "queued_body_reads": 0, "parser_calls_before_release": len(parsers), "denied_status": denied.status_code, "outsider_status": outsider.status_code, "unrelated_read_status": response.status_code})
                    finally:
                        gate.release.set()
                        responses = await asyncio.gather(*tasks)
                    # Concurrent version numbers can legitimately conflict; no
                    # hidden replay or weakening of that existing boundary.
                    self.assertEqual(sum(r.status_code in {expected, 409} for r in responses), 6, [(r.status_code, r.text[:150]) for r in responses])
                    self.assertEqual(sum(r.status_code == 503 for r in responses), 14)
                    self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 0)
                    self.assertEqual(self.app.state.upload_limiter.statistics().tasks_waiting, 0)
                    self.assertTrue(all(file.closed for parser in parsers for file in parser._files_to_close_on_error))
        folder = Path(".lenslayer/performance-follow-up")
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "upload-admission.json").write_text(json.dumps({"source_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
            "conditions": "Real ASGI multipart, synthetic ~2MiB documents, synchronized fake scanners, version extraction shortened to avoid repetitive-text diff CPU. Body/spool counts, NOT process RSS. 20 requests versus capacity2 and backlog4.", "routes": records}, indent=2))

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
