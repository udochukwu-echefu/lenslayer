"use client";

import { Braces, Check, Clipboard, Download, FileJson, FileSpreadsheet, FileUp, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { ChangeEvent, DragEvent, type ReactNode, useRef, useState } from "react";
import { parseStatementText, sampleStatementText, statementCsv, type StatementResult, type StatementTransaction } from "@/lib/document-converter";
import { StatusBadge } from "./ui/status-badge";

function download(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function pdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = "";
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line.trim()); line = ""; }
      line += `${line ? " " : ""}${item.str}`;
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}

const amountFormatter = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function EditableAmount({ value, label, onCommit }: { value: number | null; label: string; onCommit: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  function commit() {
    const normalized = draft.replaceAll(",", "").trim();
    if (!normalized) onCommit("");
    else {
      const amount = Number(normalized);
      if (Number.isFinite(amount)) onCommit(String(amount));
      else setDraft(value === null ? "" : String(value));
    }
    setEditing(false);
  }

  return <input
    className={`numeric ledger-amount${value === null ? " is-empty" : ""}`}
    type="text"
    inputMode="decimal"
    aria-label={label}
    placeholder="Empty"
    value={editing ? draft : value === null ? "" : amountFormatter.format(value)}
    onFocus={() => { setDraft(value === null ? "" : String(value)); setEditing(true); }}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
  />;
}

function highlightJsonLine(line: string) {
  const tokens: ReactNode[] = [];
  const pattern = /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
  let cursor = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push(line.slice(cursor, index));
    const className = match[1] ? "json-key" : match[2] ? "json-string" : match[3] ? "json-number" : "json-literal";
    tokens.push(<span className={className} key={`${index}-${match[0]}`}>{match[0]}</span>);
    cursor = index + match[0].length;
  }
  if (cursor < line.length) tokens.push(line.slice(cursor));
  return tokens;
}

export function DocumentConverter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<StatementResult | null>(null);
  const [state, setState] = useState<"idle" | "processing" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const previewPayload = result ? { ...result, transactions: result.transactions.slice(0, 2), truncated: result.transactions.length > 2 } : null;
  const previewLines = previewPayload ? JSON.stringify(previewPayload, null, 2).split("\n") : [];

  async function process(file: File) {
    setFileName(file.name);
    setState("processing");
    setError("");
    try {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF bank statement or financial document.");
      const parsed = parseStatementText(await pdfText(file));
      if (!parsed.transactions.length) throw new Error("No transaction rows were found. This may be a scanned PDF; run OCR first or use a text-based statement.");
      setResult(parsed);
      setState("ready");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "The document could not be converted.");
    }
  }

  function loadSample() {
    setFileName("synthetic-harbor-bank-statement.pdf");
    setResult(parseStatementText(sampleStatementText));
    setState("ready");
    setError("");
  }

  function updateRow(id: string, key: keyof StatementTransaction, value: string) {
    if (!result) return;
    setResult({ ...result, transactions: result.transactions.map((row) => row.id === id ? { ...row, [key]: ["debit", "credit", "balance"].includes(key) ? (value === "" ? null : Number(value)) : value } : row) });
  }

  async function exportXlsx() {
    if (!result) return;
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("Transactions", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "Date", key: "date", width: 16 }, { header: "Description", key: "description", width: 42 }, { header: "Reference", key: "reference", width: 20 },
      { header: "Debit", key: "debit", width: 16 }, { header: "Credit", key: "credit", width: 16 }, { header: "Balance", key: "balance", width: 16 }, { header: "Currency", key: "currency", width: 12 }, { header: "Confidence", key: "confidence", width: 14 },
    ];
    result.transactions.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF657958" } };
    [4, 5, 6].forEach((column) => { sheet.getColumn(column).numFmt = "#,##0.00;[Red]-#,##0.00"; });
    const buffer = await workbook.xlsx.writeBuffer();
    download(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "lenslayer-transactions.xlsx");
  }

  function reset() { setState("idle"); setFileName(""); setResult(null); setError(""); setCopied(false); if (inputRef.current) inputRef.current.value = ""; }

  return <div className="converter-workspace">
    <div className="converter-privacy"><ShieldCheck size={17} /><p><strong>Local processing</strong><span>Your statement is read in this browser and is not uploaded to LensLayer.</span></p></div>
    {state === "idle" && <div className="converter-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void process(file); }}>
      <FileUp size={26} /><h2>Choose a financial PDF</h2><p>Bank statements and transaction-led financial documents work best. You will review every extracted row before export.</p>
      <input ref={inputRef} className="sr-only" id="statement-file" type="file" accept="application/pdf,.pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void process(file); }} />
      <div><label className="button" htmlFor="statement-file"><FileUp size={16} />Choose PDF</label><button className="button secondary" type="button" onClick={loadSample}>Load synthetic sample</button></div>
    </div>}
    {state === "processing" && <div className="converter-processing" aria-live="polite"><LoaderCircle className="gate-spinner" size={22} /><div><strong>Reading {fileName}</strong><span>Finding transaction lines and account fields locally.</span></div></div>}
    {state === "error" && <div className="converter-error" role="alert"><div><strong>Conversion stopped</strong><p>{error}</p></div><button type="button" className="button secondary" onClick={reset}><RotateCcw size={15} />Try another PDF</button></div>}
    {state === "ready" && result && <>
      <div className="converter-summary"><div><span>Source</span><strong>{fileName}</strong></div><div><span>Rows found</span><strong>{result.transactions.length}</strong></div><div><span>Currency</span><strong>{result.currency}</strong></div><div><span>Needs review</span><strong>{result.transactions.filter((row) => row.confidence === "review").length}</strong></div></div>
      <div className="converter-table-card">
        <div className="converter-actions"><div><h2>Transaction ledger</h2><p>Check each row against the source. Debit is money out; credit is money in.</p></div><div><button className="button secondary" type="button" onClick={() => download(statementCsv(result), "text/csv;charset=utf-8", "lenslayer-transactions.csv")}><Download size={15} />CSV</button><button className="button secondary" type="button" onClick={() => void exportXlsx()}><FileSpreadsheet size={15} />Excel</button><button className="button secondary" type="button" onClick={() => download(JSON.stringify(result, null, 2), "application/json", "lenslayer-transactions.json")}><FileJson size={15} />JSON</button><button className="icon-button" type="button" aria-label="Reset converter" title="Reset converter" onClick={reset}><RotateCcw size={16} /></button></div></div>
        <div className="converter-table-wrap"><table className="converter-table"><caption className="sr-only">Extracted financial transactions, all values are editable</caption><thead><tr><th className="ledger-row-heading" scope="col">#</th><th scope="col">Date</th><th scope="col">Transaction</th><th scope="col">Reference</th><th className="ledger-money-heading ledger-debit" scope="col"><span>Debit<small>Money out · {result.currency}</small></span></th><th className="ledger-money-heading ledger-credit" scope="col"><span>Credit<small>Money in · {result.currency}</small></span></th><th className="ledger-money-heading ledger-balance" scope="col"><span>Balance<small>Running total · {result.currency}</small></span></th><th scope="col"><span>Quality<small>Extraction</small></span></th></tr></thead><tbody>{result.transactions.map((row, index) => <tr className={row.confidence === "review" ? "needs-review" : ""} key={row.id}><th className="ledger-row-number" scope="row">{String(index + 1).padStart(2, "0")}</th><td><input aria-label={`Date for ${row.description}`} value={row.date} onChange={(e) => updateRow(row.id, "date", e.target.value)} /></td><td><input aria-label={`Description for row ${row.id}`} value={row.description} onChange={(e) => updateRow(row.id, "description", e.target.value)} /></td><td><input aria-label={`Reference for ${row.description}`} placeholder="No reference" value={row.reference} onChange={(e) => updateRow(row.id, "reference", e.target.value)} /></td>{(["debit", "credit", "balance"] as const).map((key) => <td className={`ledger-money-cell ledger-${key}`} key={key}><EditableAmount label={`${key} for ${row.description}`} value={row[key]} onCommit={(value) => updateRow(row.id, key, value)} /></td>)}<td className="ledger-quality"><StatusBadge status={row.confidence === "high" ? "ready" : "needs_review"} label={row.confidence === "high" ? "Parsed" : "Check row"} /></td></tr>)}</tbody></table></div>
        <div className="converter-table-footer"><span>{result.transactions.length} extracted rows</span><span>All fields remain editable until export.</span></div>
      </div>
      <section className="api-output" aria-labelledby="payload-title">
        <div className="api-output-header"><div className="api-output-title"><span className="api-output-mark" aria-hidden="true"><Braces size={18} /></span><div><span>Developer output</span><h2 id="payload-title">Normalized JSON</h2><p>Ready for an import pipeline or webhook request.</p></div></div><div className="api-output-actions"><span>{result.transactions.length} records</span>{copied && <span className="copy-confirm" role="status"><Check size={14} />JSON copied</span>}<button className="button secondary" type="button" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); setCopied(true); }}><Clipboard size={15} />{copied ? "Copied" : "Copy JSON"}</button></div></div>
        <div className="api-output-meta"><span>application/json</span><span>UTF-8</span><span>Previewing {Math.min(2, result.transactions.length)} of {result.transactions.length} transactions</span></div>
        <pre aria-label="Normalized JSON payload preview"><code>{previewLines.map((line, index) => <span className="json-line" data-line={index + 1} key={`${index}-${line}`}>{highlightJsonLine(line)}{"\n"}</span>)}</code></pre>
      </section>
    </>}
  </div>;
}
