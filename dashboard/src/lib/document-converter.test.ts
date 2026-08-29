import { describe, expect, it } from "vitest";
import { parseStatementText, sampleStatementText, statementCsv } from "./document-converter";
import type { StatementResult } from "./document-converter";

describe("document converter", () => {
  it("extracts normalized transaction rows from statement text", () => {
    const result = parseStatementText(sampleStatementText);
    expect(result.currency).toBe("NGN");
    expect(result.institution).toBe("Harbor Bank");
    expect(result.transactions).toHaveLength(5);
    expect(result.transactions[0]).toMatchObject({ debit: null, credit: null, balance: 1240000 });
    expect(result.transactions[1]).toMatchObject({ debit: 184500, balance: 1055500, reference: "TXN-88210" });
    expect(result.transactions[2]).toMatchObject({ credit: 650000, balance: 1705500 });
  });

  it("escapes descriptions in CSV output", () => {
    const result = parseStatementText("Currency: USD\n01/08/2026 Vendor, service 25.00 975.00");
    expect(statementCsv(result)).toContain('"Vendor, service"');
  });

  it("neutralizes formula-like strings without changing numeric cells", () => {
    const prefixes = ["=", "+", "-", "@", "\t", "\r"];
    const result: StatementResult = {
      accountName: "",
      accountNumber: "",
      institution: "",
      period: "",
      currency: "USD",
      transactions: prefixes.map((prefix, index) => ({
        id: `row-${index + 1}`,
        date: "2026-08-01",
        description: `${prefix}SUM(A1:A2)`,
        reference: `${prefix}REF-001`,
        debit: -100,
        credit: null,
        balance: 900,
        currency: "USD",
        confidence: "high",
      })),
    };

    const csv = statementCsv(result);

    for (const prefix of prefixes) {
      expect(csv).toContain(`"'${prefix}SUM(A1:A2)"`);
      expect(csv).toContain(`"'${prefix}REF-001"`);
    }
    expect(csv).toContain('"-100"');
    expect(csv).not.toContain('"=SUM(A1:A2)"');
  });
});
