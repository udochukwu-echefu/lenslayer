export type StatementTransaction = {
  id: string;
  date: string;
  description: string;
  reference: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  currency: string;
  confidence: "high" | "review";
};

export type StatementResult = {
  accountName: string;
  accountNumber: string;
  institution: string;
  period: string;
  currency: string;
  transactions: StatementTransaction[];
};

const datePattern = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4})\b/i;
const amountPattern = /(?:[$£€₦]\s*)?\(?-?\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?|(?:[$£€₦]\s*)?\(?-?\d+(?:\.\d{2})\)?/g;

function money(value: string) {
  const negative = value.includes("(") || value.includes("-");
  const parsed = Number(value.replace(/[$£€₦,()\s-]/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

function currencyFrom(text: string) {
  if (/₦|\bNGN\b/i.test(text)) return "NGN";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  if (/€|\bEUR\b/i.test(text)) return "EUR";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  return "USD";
}

function valueAfter(text: string, labels: string[]) {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[:#-]?\\s*([^\\n]{3,80})`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function institutionFrom(lines: string[]) {
  const labelled = lines.find((line) => /^(?:bank|financial institution)\s*[:#-]/i.test(line));
  if (labelled) return labelled.replace(/^(?:bank|financial institution)\s*[:#-]\s*/i, "").trim();
  return lines.find((line) => /\b(bank|credit union|building society)\b/i.test(line) && !/:/.test(line)) ?? "";
}

function classifyAmounts(line: string, values: number[]) {
  const lower = line.toLowerCase();
  const debitWord = /\b(debit|withdrawal|payment|purchase|fee|charge|dr)\b/.test(lower);
  const creditWord = /\b(credit|deposit|funding|salary|refund|cr)\b/.test(lower);
  if (values.length >= 3) return { debit: values.at(-3) ?? null, credit: values.at(-2) ?? null, balance: values.at(-1) ?? null };
  if (values.length === 2) return { debit: creditWord ? null : values[0], credit: creditWord ? values[0] : null, balance: values[1] };
  if (/\b(opening|closing|available)\s+balance\b/.test(lower)) return { debit: null, credit: null, balance: values[0] ?? null };
  return { debit: creditWord ? null : values[0] ?? null, credit: creditWord && !debitWord ? values[0] ?? null : null, balance: null };
}

export function parseStatementText(rawText: string): StatementResult {
  const text = rawText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const currency = currencyFrom(text);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const transactions: StatementTransaction[] = [];
  let pending = "";

  for (const line of lines) {
    const date = line.match(datePattern)?.[0];
    if (!date) {
      if (transactions.length && !amountPattern.test(line) && line.length < 120) {
        transactions[transactions.length - 1].description += ` ${line}`;
      } else if (line.length < 120) pending = line;
      amountPattern.lastIndex = 0;
      continue;
    }
    const dateEnd = line.indexOf(date) + date.length;
    const amountMatches = [...line.matchAll(amountPattern)]
      .filter((match) => match.index === undefined || match.index >= dateEnd);
    const amounts = amountMatches
      .map((match) => money(match[0]))
      .filter((value): value is number => value !== null);
    if (!amounts.length) continue;
    const firstAmount = amountMatches[0]?.index ?? -1;
    amountPattern.lastIndex = 0;
    const middle = line.slice(line.indexOf(date) + date.length, firstAmount > -1 ? firstAmount : undefined).trim();
    const referenceMatch = middle.match(/\b((?:TRX|TXN|ID)[:#-]?[A-Z0-9-]{4,})\b/i);
    const description = middle.replace(referenceMatch?.[0] ?? "", "").replace(/\bREF\b/gi, "").replace(/\s{2,}/g, " ").trim() || pending || "Transaction";
    const classified = classifyAmounts(line, amounts);
    transactions.push({
      id: `row-${transactions.length + 1}`,
      date,
      description,
      reference: referenceMatch?.[1] ?? "",
      ...classified,
      currency,
      confidence: amounts.length >= 2 && description !== "Transaction" ? "high" : "review",
    });
    pending = "";
  }

  return {
    accountName: valueAfter(text, ["account name", "customer name", "statement for"]),
    accountNumber: valueAfter(text, ["account number", "account no", "account #"]).replace(/\s.*/, ""),
    institution: institutionFrom(lines),
    period: valueAfter(text, ["statement period", "period"]),
    currency,
    transactions,
  };
}

export function statementCsv(result: StatementResult) {
  const cells = (value: string | number | null) => {
    const rawValue = String(value ?? "");
    const safeValue = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${rawValue}` : rawValue;
    return `"${safeValue.replaceAll('"', '""')}"`;
  };
  const headers = ["date", "description", "reference", "debit", "credit", "balance", "currency", "confidence"];
  return [headers.map(cells).join(","), ...result.transactions.map((row) => headers.map((key) => cells(row[key as keyof StatementTransaction] as string | number | null)).join(","))].join("\n");
}

export const sampleStatementText = `Harbor Bank
Account Name: Northstar Services Ltd
Account Number: 0048291037
Statement Period: 01/07/2026 - 31/07/2026
Currency: NGN
01/07/2026 Opening balance 1,240,000.00
03/07/2026 Vendor payment REF TXN-88210 184,500.00 1,055,500.00
08/07/2026 Client funding REF TXN-88391 650,000.00 1,705,500.00 CR
14/07/2026 Bank service fee 2,500.00 1,703,000.00
22/07/2026 Office lease payment REF TXN-88942 420,000.00 1,283,000.00`;
