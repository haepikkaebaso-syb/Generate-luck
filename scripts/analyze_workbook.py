"""Read the supplied workbook without recalculating or editing the original."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET

SOURCE = Path(r"E:\아이스아메리카노\6_45 select.xlsx")
ROOT = Path(__file__).resolve().parents[1]
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def read_book(path=SOURCE):
    book = {}
    with zipfile.ZipFile(path) as archive:
        strings = ["".join(si.itertext()) for si in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        rels = {el.attrib["Id"]: el.attrib["Target"] for el in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        for sheet in workbook.find("s:sheets", NS):
            tree = ET.fromstring(archive.read("xl/" + rels[sheet.attrib[RID]]))
            cells = {}
            for cell in tree.findall("s:sheetData/s:row/s:c", NS):
                value = cell.findtext("s:v", namespaces=NS)
                formula = cell.find("s:f", NS)
                ctype = cell.attrib.get("t", "n")
                if ctype == "s" and value is not None:
                    value = strings[int(value)]
                elif ctype == "inlineStr":
                    value = "".join(cell.find("s:is", NS).itertext())
                elif ctype == "n" and value is not None:
                    value = float(value)
                    if value.is_integer():
                        value = int(value)
                if value is not None or formula is not None:
                    cells[cell.attrib["r"]] = {"value": value, "formula": formula.text if formula is not None else None,
                                               "formulaAttributes": formula.attrib if formula is not None else {}, "type": ctype}
            book[sheet.attrib["name"]] = {"dimension": tree.find("s:dimension", NS).attrib["ref"], "cells": cells}
    return book


def extract_draws(cells, round_column="B", date_column="C", numbers_columns="NOPQRS", bonus_column="T"):
    rows = sorted({int(re.search(r"\d+$", key).group()) for key in cells})
    draws, rejected = [], []
    for row in rows:
        def value(column):
            return cells.get(f"{column}{row}", {}).get("value")
        round_number = value(round_column)
        if not isinstance(round_number, int) or not 1 <= round_number <= 10000:
            continue
        numbers = [value(col) for col in numbers_columns]
        bonus = value(bonus_column)
        if all(num is None for num in numbers):
            rejected.append({"row": row, "round": round_number, "reason": "no winning numbers"})
            continue
        valid = all(isinstance(n, int) and 1 <= n <= 45 for n in numbers) and len(set(numbers)) == 6
        valid_bonus = bonus is None or isinstance(bonus, int) and 1 <= bonus <= 45 and bonus not in numbers
        if not valid or not valid_bonus:
            rejected.append({"row": row, "round": round_number, "reason": "invalid numbers or bonus", "numbers": numbers, "bonus": bonus})
            continue
        date_value = value(date_column)
        date = None
        if isinstance(date_value, str) and re.fullmatch(r"\d{4}[.-]\d{2}[.-]\d{2}", date_value):
            date = datetime.strptime(date_value.replace(".", "-"), "%Y-%m-%d").date().isoformat()
        draws.append({"round": round_number, "date": date, "numbers": sorted(numbers), "bonus": bonus, "sourceRow": row})
    return draws, rejected


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sheet")
    parser.add_argument("--cells", help="Comma-separated cells")
    parser.add_argument("--rows", help="Inclusive row range e.g. 6:30")
    parser.add_argument("--columns", default="A:T", help="Inclusive columns for --rows")
    args = parser.parse_args()
    book = read_book()
    if args.sheet:
        selected = book[args.sheet]["cells"]
        if args.cells:
            print(json.dumps({k: selected.get(k) for k in args.cells.split(",")}, ensure_ascii=False, indent=2))
        elif args.rows:
            start, end = map(int, args.rows.split(":"))
            def colnum(text):
                n=0
                for char in text: n=n*26+ord(char)-64
                return n
            left, right = map(colnum, args.columns.split(":"))
            print(json.dumps({k: v for k,v in selected.items() if start <= int(re.search(r"\d+$",k).group()) <= end and left <= colnum(re.match(r"[A-Z]+",k).group()) <= right}, ensure_ascii=False, indent=2))
        return
    summaries = []
    for name, sheet in book.items():
        cells = sheet["cells"]
        formula_cells = {cell: v for cell,v in cells.items() if v["formula"] is not None or v["formulaAttributes"]}
        functions = Counter(fn for value in formula_cells.values() for fn in re.findall(r"\b([A-Z][A-Z0-9.]*)\(",value["formula"] or ""))
        errors = [{"cell": cell,"value": v["value"]} for cell,v in cells.items() if v["type"] == "e"]
        random_samples = [{"cell": cell,"formula": v["formula"], "cachedValue": v["value"]} for cell,v in cells.items() if v["formula"] and "RAND" in v["formula"]][:8]
        result = {"name": name,"dimension":sheet["dimension"], "nonemptyCells":len(cells),"formulaCells":len(formula_cells),"functions":dict(functions.most_common()),"cachedErrorCount":len(errors),"cachedErrorSamples":errors[:12], "randomFormulaSamples":random_samples}
        if name in ["6,45 result", "6,45 select", "분석도구"]:
            draws, rejected = extract_draws(cells)
            result["historicalRecords"] = {"count":len(draws),"first":min(draws,key=lambda d:d["round"]) if draws else None,"last":max(draws,key=lambda d:d["round"]) if draws else None,"rejectedRows":rejected}
        summaries.append(result)
    data = ROOT / "data"
    data.mkdir(exist_ok=True)
    report = {"source":"6_45 select.xlsx", "sourceSha256":hashlib.sha256(SOURCE.read_bytes()).hexdigest(), "sourceBytes":SOURCE.stat().st_size,
              "analysisMethod":"Read-only OOXML extraction of saved values and formulas; Excel recalculation not performed.", "sheets":summaries}
    (data / "workbook-analysis.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
