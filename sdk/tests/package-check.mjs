import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkMetadata, inspectTarball, packageFiles } from "../scripts/artifact.mjs";

const root = mkdtempSync(join(tmpdir(), "lenslayer-sdk-pack-"));
try {
  const source = JSON.parse(readFileSync("package.json"));
  checkMetadata(source, source.version);
  const supplied = process.argv[2];
  const packed = supplied ? undefined : JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", root], { encoding: "utf8" }))[0];
  const tarball = supplied ? resolve(supplied) : join(root, packed.filename);
  inspectTarball(tarball, source.version);
  writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball], { cwd: root, stdio: "pipe" });
  execFileSync(process.execPath, ["--input-type=module", "-e", 'import {LensLayerClient,isTerminalRun} from "@lenslayer/agent-sdk"; if(typeof LensLayerClient !== "function" || !isTerminalRun("succeeded")) throw Error("exports");'], { cwd: root });
  writeFileSync(join(root, "types-smoke.ts"), `import { LensLayerClient, type WorkflowCreate, type CalendarActionInput, type InputSupply, type WorkflowGraphCreate, type WorkflowGraph, type ContextEvidenceReceipt } from "@lenslayer/agent-sdk";
const event: CalendarActionInput = {type:"calendar_event_created",connection_id:"connection",calendar_id:"calendar",summary:"Reminder",start_at:"2099-01-01T09:00:00Z",end_at:"2099-01-01T10:00:00Z"};
const workflow: WorkflowCreate = {idempotency_key:"run",goal:"Exact reminder",allowed_tools:["google_calendar.events.create"],deadline_at:"2099-01-02T00:00:00Z",success_condition:{type:"all",conditions:[{id:"event",condition:event}]}};
const client = new LensLayerClient({baseUrl:"https://fixture.example.test",token:"placeholder"});
const supply: InputSupply = {values:{notice_days:30}};
void client.createWorkflow(workflow); void client.proposeToolAction("run",{idempotency_key:"event",tool:"google_calendar.events.create",input:event}); void client.supplyInput("run","request",supply);
const graph: WorkflowGraphCreate = {idempotency_key:"graph",goal:"Create exact tasks",context_ids:["context"],deadline_at:"2099-01-02T00:00:00Z",nodes:[{id:"follow-up",when:{fact:"needed",value:true,equals:true},task:{context_id:"context",query:"onboarding",assigned_to_user_id:"member",title:"Follow up",due_at:"2099-01-03T00:00:00Z"}}]};
const readback: Promise<WorkflowGraph> = client.graph("run");
const receipts: Promise<ContextEvidenceReceipt[]> = client.retrieveContextEvidence("run",{context_ids:["context"],query:"onboarding"});
void client.createWorkflowGraph(graph); void readback; void receipts; void client.readContextEvidence("run","receipt");
void client.searchContext({context_ids:["context"],query:"onboarding"});
`);
  execFileSync(resolve("node_modules/.bin/tsc"), ["--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "types-smoke.ts"], { cwd: root, stdio: "pipe" });
  const pkg = JSON.parse(readFileSync(join(root, "node_modules/@lenslayer/agent-sdk/package.json")));
  checkMetadata(pkg, source.version);
  assert.equal(readFileSync(join(root, "node_modules/@lenslayer/agent-sdk/LICENSE"), "utf8"), readFileSync("LICENSE", "utf8"));
  console.log(`Exact package allowlist, MIT license, credential scan, installed ESM exports and TypeScript declarations passed (${packageFiles.length} files).`);
} finally { rmSync(root, { recursive: true, force: true }); }
