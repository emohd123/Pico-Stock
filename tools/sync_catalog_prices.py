from __future__ import annotations

import argparse
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync catalog prices from the Pico PDF rate table into the site database.")
    parser.add_argument("--pdf", required=True, help="Path to the rental catalogue PDF.")
    parser.add_argument("--db", required=True, help="Path to the SQLite database file.")
    return parser.parse_args()


def normalize_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def parse_pdf_rates(pdf_path: Path) -> tuple[dict[str, float], dict[str, float]]:
    rates_by_id: dict[str, float] = {}
    rates_by_code: dict[str, float] = {}

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_number in (4, 5):
            rows = defaultdict(list)
            for word in pdf.pages[page_number].extract_words(x_tolerance=2, y_tolerance=2):
                rows[round(word["top"])].append(word)

            for key in sorted(rows):
                tokens = [entry["text"] for entry in sorted(rows[key], key=lambda item: item["x0"])]
                numbers = [token for token in tokens if re.fullmatch(r"\d+(?:\.\d+)?", token)]
                if len(numbers) < 2:
                    continue

                row_id = next((token for token in tokens if re.fullmatch(r"\d{3,4}", token)), None)
                code = next((token for token in tokens if re.fullmatch(r"[A-Z][A-Z0-9]+", token) and not token.startswith("H")), None)
                if not row_id or not code:
                    continue

                rate = float(numbers[-1])
                rates_by_id[row_id] = rate
                rates_by_code[code.upper()] = rate

    return rates_by_id, rates_by_code


def update_database(db_path: Path, rates_by_id: dict[str, float], rates_by_code: dict[str, float]) -> tuple[int, list[str]]:
    matched = 0
    updated_codes: list[str] = []
    now = datetime.now(timezone.utc).isoformat()

    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        rows = cursor.execute(
            "SELECT Id, SourceItemId, PicoCode FROM CatalogItems ORDER BY Id"
        ).fetchall()

        for record_id, source_item_id, pico_code in rows:
            price = None
            normalized_id = normalize_digits(source_item_id or "")
            if normalized_id in rates_by_id:
                price = rates_by_id[normalized_id]
            elif (pico_code or "").upper() in rates_by_code:
                price = rates_by_code[(pico_code or "").upper()]

            if price is None:
                continue

            cursor.execute(
                """
                UPDATE CatalogItems
                SET Price = ?,
                    Currency = 'BHD',
                    IsActive = 1,
                    IsVerified = 1,
                    LastVerifiedAtUtc = ?
                WHERE Id = ?
                """,
                (price, now, record_id),
            )
            matched += 1
            updated_codes.append(pico_code)

        conn.commit()

    return matched, updated_codes


def main() -> None:
    args = parse_args()
    pdf_path = Path(args.pdf)
    db_path = Path(args.db)

    rates_by_id, rates_by_code = parse_pdf_rates(pdf_path)
    matched, codes = update_database(db_path, rates_by_id, rates_by_code)

    print(f"Matched and updated {matched} catalog items.")
    if codes:
        print("Updated codes:")
        for code in codes:
            print(code)


if __name__ == "__main__":
    main()
