"""Independent loop-based count and mathematical invariant verification."""
import json
import math
from pathlib import Path
import random

HERE = Path(__file__).resolve().parent
draws = json.loads(Path(r"D:\로또 당첨번호 발생기\data\draws.json").read_text(encoding="utf-8-sig"))["draws"]
rows = [set(d["numbers"]) for d in draws]
raw = json.loads((HERE/"lag-associations-all-counts.json").read_text(encoding="utf-8"))
summary = json.loads((HERE/"lag-associations-summary.json").read_text(encoding="utf-8"))
checks = []

assert summary["method"]["ruleCount"] == 558900
checks.append("558900 conditional rules across 12 lags")
assert math.comb(45, 6) == summary["fullSixPattern"]["possibleCombinations"]
assert len(set(tuple(sorted(r)) for r in rows)) == 522
checks.append("All 522 full-six sets distinct; 8145060 possible")

rng = random.Random(12345)
for record in raw["records"]:
    lag, transitions = record["lag"], record["transitionCount"]
    target_counts = [sum(t in row for row in rows[lag:]) for t in range(1, 46)]
    assert target_counts == record["targetCounts"]
    for kind, antecedents, count_per_source in [
        ("single", [[v] for v in raw["singleAntecedents"]], 6),
        ("pair", raw["pairAntecedents"], 15),
    ]:
        hits = record[kind]["hits"]
        support = record[kind]["support"]
        assert sum(support) == transitions*count_per_source
        assert all(sum(row) == ss*6 for row, ss in zip(hits, support))
        assert all(sum(row[t] for row in hits) == target_counts[t]*count_per_source for t in range(45))
        for idx in rng.sample(range(len(antecedents)), 20):
            positions = [i for i in range(transitions) if set(antecedents[idx]) <= rows[i]]
            assert len(positions) == support[idx]
            for target in rng.sample(range(1, 46), 10):
                assert sum(target in rows[i+lag] for i in positions) == hits[idx][target-1]
    mean_shared = sum(len(rows[i] & rows[i+lag]) for i in range(transitions))/transitions
    reported = next(x["meanSharedNumbers"] for x in summary["lagOverlap"] if x["lag"] == lag)
    assert abs(reported-mean_shared) < 1e-12
checks.append("All row/column count invariants and 4800 randomly selected rule counts independently verified")
checks.append("All 12 mean overlaps independently verified using Python set intersections")

for rule in summary["topPositiveRules"] + summary["topNegativeRules"]:
    lag = rule["lag"]
    positions = [i for i in range(len(rows)-lag) if set(rule["antecedent"]) <= rows[i]]
    assert len(positions) == rule["support"]
    assert sum(rule["target"] in rows[i+lag] for i in positions) == rule["hits"]
    assert rule["sourceRounds"] == [draws[i]["round"] for i in positions]
    assert rule["hitTargetRounds"] == [draws[i+lag]["round"] for i in positions if rule["target"] in rows[i+lag]]
    exceedances = sum(max(pair) >= abs(rule["standardizedResidual"])-1e-12
                      for pair in raw["permutationMaxAbsoluteResidualSingleAndPair"])
    assert abs(rule["familywisePermutationP"] - (1+exceedances)/1000) < 1e-12
checks.append("All 40 displayed extreme rules independently recounted and adjusted p-values reconstructed")

assert all(sum(draws[i]["numbers"]) > 0 for i in range(len(draws)))
result = {"passed": True, "checks": checks}
(HERE/"verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))
