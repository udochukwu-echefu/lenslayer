import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "lenslayer-sdk-pack-"));
try {
  const dry = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }))[0];
  assert.equal(dry.version, "0.1.0");
  const permitted = /^(package\.json|README\.md|LICENSE|CHANGELOG\.md|dist\/[a-z]+\.(js|d\.ts))$/;
  for (const file of dry.files) {
    assert.match(file.path, permitted);
    assert.doesNotMatch(readFileSync(file.path, "utf8"), /ll_agent_[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{16,}/);
  }
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", root], { encoding: "utf8" }))[0];
  writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(root, packed.filename)], { cwd: root, stdio: "pipe" });
  execFileSync(process.execPath, ["--input-type=module", "-e", 'import {LensLayerClient,isTerminalRun} from "@lenslayer/agent-sdk"; if(typeof LensLayerClient !== "function" || !isTerminalRun("succeeded")) throw Error("exports");'], { cwd: root });
  writeFileSync(join(root, "types-smoke.ts"), `import { LensLayerClient, type WorkflowCreate, type CalendarActionInput, type InputSupply } from "@lenslayer/agent-sdk";
const event: CalendarActionInput = {type:"calendar_event_created",connection_id:"connection",calendar_id:"calendar",summary:"Reminder",start_at:"2099-01-01T09:00:00Z",end_at:"2099-01-01T10:00:00Z"};
const workflow: WorkflowCreate = {idempotency_key:"run",goal:"Exact reminder",allowed_tools:["google_calendar.events.create"],deadline_at:"2099-01-02T00:00:00Z",success_condition:{type:"all",conditions:[{id:"event",condition:event}]}};
const client = new LensLayerClient({baseUrl:"https://fixture.example.test",token:"placeholder"});
const supply: InputSupply = {values:{notice_days:30}};
void client.createWorkflow(workflow); void client.proposeToolAction("run",{idempotency_key:"event",tool:"google_calendar.events.create",input:event}); void client.supplyInput("run","request",supply);
`);
  execFileSync(resolve("node_modules/.bin/tsc"), ["--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "types-smoke.ts"], { cwd: root, stdio: "pipe" });
  const pkg = JSON.parse(readFileSync(join(root, "node_modules/@lenslayer/agent-sdk/package.json")));
  assert.equal(pkg.license, "UNLICENSED");
  assert.equal(pkg.dependencies, undefined);
  console.log(`Package allowlist, credential scan, installed ESM exports and TypeScript declarations passed (${dry.files.length} files).`);
} finally { rmSync(root, { recursive: true, force: true }); }
