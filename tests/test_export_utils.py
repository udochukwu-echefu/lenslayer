import csv
import io
import unittest

from backend.app.report_exports import build_csv, csv_safe_cell


class CsvExportSafetyTests(unittest.TestCase):
    def test_formula_prefixes_are_neutralized_without_changing_numbers(self):
        prefixes = ("=", "+", "-", "@", "\t", "\r")
        rows = [
            {"label": f"{prefix}SUM(A1:A2)", "amount": -100}
            for prefix in prefixes
        ]

        exported = list(csv.DictReader(io.StringIO(build_csv(rows))))

        self.assertEqual([row["label"] for row in exported], [f"'{row['label']}" for row in rows])
        self.assertTrue(all(row["amount"] == "-100" for row in exported))
        self.assertEqual(csv_safe_cell(42), 42)

    def test_formula_prefixed_headers_are_neutralized(self):
        output = build_csv([{"=SUM(A1:A2)": "safe", "amount": -100}])

        rows = list(csv.reader(io.StringIO(output)))

        self.assertEqual(rows[0], ["'=SUM(A1:A2)", "amount"])
        self.assertEqual(rows[1], ["safe", "-100"])


if __name__ == "__main__":
    unittest.main()
