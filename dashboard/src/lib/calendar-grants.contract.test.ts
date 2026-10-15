import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { calendarGrants } from "./hosted-agent-state";
import type { IntegrationConnection } from "./types";
import { calendarConnectionFixture } from "@/test/hosted-fixtures";

it("selects the original Calendar target from the official OAuth producer and serializer field projection", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const localPython = resolve(root, ".venv/bin/python");
  const pythonExecutable = process.env.LENSLAYER_TEST_PYTHON ?? (existsSync(localPython) ? localPython : "python3");
  // Standard-library-only source fixture: execute the actual producer constructor,
  // JSON helpers and serializer, not a second hand-written capability list.
  // Only ORM/schema constructors are replaced with data containers. No backend
  // imports, dotenv, database, credentials or provider transport are initialized.
  const python = `from __future__ import annotations
import ast,json,sys
from pathlib import Path
from types import SimpleNamespace

def function(path, name):
    tree=ast.parse(Path(path).read_text())
    matches=[node for node in ast.walk(tree) if isinstance(node,ast.FunctionDef) and node.name==name]
    assert len(matches)==1, 'Official contract function changed; review source fixture'
    return matches[0]

common='backend/app/service_domains/common.py'
serializer=function('backend/app/service_domains/integrations.py','integration_connection_response')
serializer.decorator_list=[]
module=ast.Module(body=[ast.ImportFrom(module='__future__',names=[ast.alias(name='annotations')],level=0),
    function(common,'json_dump'),function(common,'json_load'),serializer],type_ignores=[])
namespace={'json':json,'IntegrationConnectionResponse':dict,'IntegrationConnection':SimpleNamespace}
exec(compile(ast.fix_missing_locations(module),'<official-connection-serializer>','exec'),namespace)

producer=function('backend/app/service_domains/calendar.py','complete_calendar_oauth')
constructors=[node.value for node in ast.walk(producer) if isinstance(node,ast.Assign)
    and any(isinstance(target,ast.Name) and target.id=='connection' for target in node.targets)
    and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Name)
    and node.value.func.id=='IntegrationConnection']
assert len(constructors)==1, 'Official OAuth connection constructor changed; review source fixture'
data=json.load(sys.stdin)
namespace.update(connection_id=data['id'],organization_id=data['org'],user=SimpleNamespace(id=data['user']),
    request=SimpleNamespace(display_name=data['label'],calendar_id=data['calendar']))
connection=eval(compile(ast.Expression(body=constructors[0]),'<official-oauth-connection>','eval'),namespace)
connection.created_by=SimpleNamespace(display_name='Owner')
connection.last_sync_at=None
connection.error_message=''
connection.created_at=connection.updated_at='2026-10-09T09:00:00Z'
print(json.dumps(namespace['integration_connection_response'](connection)))`;
  const result = spawnSync(pythonExecutable, ["-c", python], {
    cwd: root, env: { PATH: process.env.PATH, NODE_ENV: "test" }, encoding: "utf8", timeout: 10_000,
    input: JSON.stringify({ id: "connection-1", org: "org-1", user: "user-1", label: "Owned sandbox calendar", calendar: "sandbox@example.test" }),
  });
  expect(result.error?.name).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const connection = JSON.parse(result.stdout) as IntegrationConnection;
  expect(connection).toEqual(calendarConnectionFixture);
  expect(connection.capabilities).toEqual(["events.create", "events.get"]);
  expect(calendarGrants([connection], "org-1")).toEqual([
    { connection, calendarId: "sandbox@example.test", value: JSON.stringify(["connection-1", "sandbox@example.test"]) },
  ]);
  expect(calendarGrants([connection], "other-org")).toEqual([]);
});
