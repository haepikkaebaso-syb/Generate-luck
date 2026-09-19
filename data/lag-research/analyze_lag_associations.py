"""Exploratory, whole-draw permutation audit of serial Korean Lotto associations.

No fitted forecasting claim follows from this historical ordering test. The same
last 104 draws were inspected by prior analyses, so there is no untouched holdout.
All source numbers are the six main balls; bonus balls are excluded.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
from itertools import combinations
import json
import math
from pathlib import Path
import time

import numpy as np
from scipy.stats import beta

LAGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 52]
SEED = 64520260913


def clean_json(value):
    if isinstance(value, dict):
        return {str(k): clean_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean_json(v) for v in value]
    if isinstance(value, np.ndarray):
        return clean_json(value.tolist())
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value) if np.isfinite(value) else None
    return value


def write_json(path, data, pretty=True):
    path.write_text(json.dumps(clean_json(data), ensure_ascii=False,
                               indent=2 if pretty else None,
                               allow_nan=False), encoding="utf-8")


def exact_interval(exceedances, simulations):
    # Interval for the Monte Carlo tail probability (not the +1 p-value).
    lo = 0 if exceedances == 0 else beta.ppf(.025, exceedances, simulations-exceedances+1)
    hi = 1 if exceedances == simulations else beta.ppf(.975, exceedances+1, simulations-exceedances)
    return [float(lo), float(hi)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=r"D:\로또 당첨번호 발생기\data\draws.json")
    parser.add_argument("--output", default=str(Path(__file__).resolve().parent))
    parser.add_argument("--permutations", type=int, default=999)
    args = parser.parse_args()
    started = time.monotonic()
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    source = json.loads(Path(args.source).read_text(encoding="utf-8-sig"))
    draws = sorted(source["draws"], key=lambda x: x["round"])
    balls = np.array([d["numbers"] for d in draws], dtype=np.int32) - 1
    n = len(draws)
    assert balls.shape == (522, 6)
    assert all(len(set(row)) == 6 and min(row) >= 0 and max(row) < 45 for row in balls)
    assert all(draws[i+1]["round"] == draws[i]["round"]+1 for i in range(n-1))
    all_pairs = list(combinations(range(45), 2))
    pair_lookup = np.full((45, 45), -1, dtype=np.int32)
    for idx, (a, b) in enumerate(all_pairs):
        pair_lookup[a, b] = pair_lookup[b, a] = idx
    pi, pj = np.array(list(combinations(range(6), 2))).T
    pairs = pair_lookup[balls[:, pi], balls[:, pj]]
    number_freq = np.bincount(balls.ravel(), minlength=45)
    permutation_overlap_mean = (int(number_freq @ number_freq)-n*6) / (n*(n-1))
    fair_overlap_variance = 6*(6/45)*(39/45)*(39/44)

    def statistic(order, retain=False):
        oballs = balls[order]
        opairs = pairs[order]
        single_max, pair_max = 0.0, 0.0
        overlap_means, records = [], []
        for lag in LAGS:
            targets = oballs[lag:]
            trial_count = len(targets)
            target_freq = np.bincount(targets.ravel(), minlength=45)
            target_rate = target_freq / trial_count
            lag_records = {"lag": lag, "transitionCount": trial_count,
                           "targetCounts": target_freq}
            for kind, antecedents, m in [("single", oballs[:-lag], 45),
                                         ("pair", opairs[:-lag], 990)]:
                support = np.bincount(antecedents.ravel(), minlength=m)
                addresses = antecedents[:, :, None]*45 + targets[:, None, :]
                hit = np.bincount(addresses.ravel(), minlength=m*45).reshape(m, 45)
                expected = support[:, None] * target_rate[None, :]
                # Standardized hypergeometric residual is only a score. Its
                # distribution is calibrated by whole-draw permutations below.
                variance = expected * (1-target_rate)[None, :] * (trial_count-support[:, None])/(trial_count-1)
                z = np.divide(hit-expected, np.sqrt(variance),
                              out=np.zeros_like(expected), where=variance > 0)
                maximum = float(np.max(np.abs(z)))
                if kind == "single":
                    single_max = max(single_max, maximum)
                    overlap_means.append(float(np.trace(hit))/trial_count)
                else:
                    pair_max = max(pair_max, maximum)
                if retain:
                    lag_records[kind] = {"support": support, "hits": hit, "z": z}
            if retain:
                records.append(lag_records)
        return single_max, pair_max, np.array(overlap_means), records

    observed_single, observed_pair, observed_overlap, records = statistic(np.arange(n), True)
    rng = np.random.default_rng(SEED)
    permutation_max = np.empty((args.permutations, 2))
    permutation_overlap = np.empty((args.permutations, len(LAGS)))
    for i in range(args.permutations):
        ss, ps, ov, _ = statistic(rng.permutation(n))
        permutation_max[i] = [ss, ps]
        permutation_overlap[i] = ov
        if (i+1) % 100 == 0 or i+1 == args.permutations:
            print(f"Completed {i+1}/{args.permutations} permutations, elapsed {time.monotonic()-started:.1f}s", flush=True)
    joint_max = np.max(permutation_max, axis=1)
    observed_joint_max = max(observed_single, observed_pair)

    def p_of(score, distribution=joint_max):
        return (1+int(np.count_nonzero(distribution >= abs(score)-1e-12)))/(args.permutations+1)

    def rule_record(record, kind, index):
        source_idx, target = np.unravel_index(int(index), record[kind]["z"].shape)
        support = int(record[kind]["support"][source_idx])
        hits = int(record[kind]["hits"][source_idx, target])
        background = int(record["targetCounts"][target])/record["transitionCount"]
        antecedent = [source_idx+1] if kind == "single" else [v+1 for v in all_pairs[source_idx]]
        z = float(record[kind]["z"][source_idx, target])
        # Exact source and target rounds make every displayed conditional count auditable.
        antecedent_zero = np.array(antecedent)-1
        source_positions = [i for i in range(n-record["lag"])
                            if all(v in balls[i] for v in antecedent_zero)]
        source_rounds = [draws[i]["round"] for i in source_positions]
        hit_rounds = [draws[i+record["lag"]]["round"] for i in source_positions
                      if target in balls[i+record["lag"]]]
        return {"antecedent": antecedent, "target": int(target+1), "lag": record["lag"],
                "support": support, "hits": hits, "conditionalRate": hits/support if support else None,
                "backgroundRate": background, "lift": hits/support/background if support else None,
                "standardizedResidual": z, "familywisePermutationP": p_of(z),
                "sourceRounds": source_rounds, "hitTargetRounds": hit_rounds}

    candidates_positive, candidates_negative = [], []
    support_per_lag, top_per_lag = [], []
    for record in records:
        top = {"lag": record["lag"]}
        for kind in ["single", "pair"]:
            z = record[kind]["z"]
            # Retain 24 from each stratum so global top 20 is guaranteed represented.
            positive_indices = np.argsort(z.ravel())[-24:][::-1]
            negative_indices = np.argsort(z.ravel())[:24]
            pp = [rule_record(record, kind, i) for i in positive_indices]
            nn = [rule_record(record, kind, i) for i in negative_indices]
            candidates_positive.extend(pp)
            candidates_negative.extend(nn)
            top[kind+"Positive"] = pp[:2]
            top[kind+"Negative"] = nn[:2]
        support = record["pair"]["support"]
        support_per_lag.append({"lag": record["lag"], "transitions": record["transitionCount"],
                               "min": int(support.min()), "median": float(np.median(support)),
                               "mean": float(support.mean()), "max": int(support.max()),
                               "zeroSupportPairs": int(np.count_nonzero(support == 0)),
                               "under5SupportPairs": int(np.count_nonzero(support < 5)),
                               "under10SupportPairs": int(np.count_nonzero(support < 10))})
        top_per_lag.append(top)

    # A separate family of 12 lag-overlap diagnostics. These adjusted p-values
    # control this 12-test family only, not the combined conditional-rule family.
    scale = np.sqrt(fair_overlap_variance / (n-np.array(LAGS)))
    observed_overlap_z = (observed_overlap-permutation_overlap_mean)/scale
    perm_overlap_z = (permutation_overlap-permutation_overlap_mean)/scale
    perm_overlap_abs_max = np.max(np.abs(perm_overlap_z), axis=1)
    lag_overlap = []
    for j, lag in enumerate(LAGS):
        lag_overlap.append({"lag": lag, "transitions": n-lag,
                            "meanSharedNumbers": observed_overlap[j],
                            "fairIndependentExpected": .8,
                            "drawPermutationExpected": permutation_overlap_mean,
                            "permutationPUnadjusted": p_of(observed_overlap_z[j], np.abs(perm_overlap_z[:, j])),
                            "permutationPAdjusted12Lags": p_of(observed_overlap_z[j], perm_overlap_abs_max)})

    recurrence = []
    for k in range(1, 7):
        counts = Counter(c for row in balls for c in combinations((int(v+1) for v in row), k))
        repeats = [count for count in counts.values() if count >= 2]
        recurrence.append({"size": k, "possiblePatterns": math.comb(45, k),
                           "observedOccurrences": n*math.comb(6, k), "distinctObserved": len(counts),
                           "distinctRepeated": len(repeats), "maxSupport": max(counts.values()),
                           "meanSupportAcrossAllPossible": n*math.comb(6, k)/math.comb(45, k),
                           "observedPatternFraction": len(counts)/math.comb(45, k),
                           "histogramObservedPatternSupport": dict(sorted(Counter(counts.values()).items()))})

    total_combinations = math.comb(45, 6)
    family_tests = len(LAGS)*(45*45+math.comb(45, 2)*45)
    exceedances = int(np.count_nonzero(joint_max >= observed_joint_max-1e-12))
    full_counts = Counter(tuple(int(x+1) for x in row) for row in balls)
    duplicated_full = [{"numbers": list(k), "count": v} for k, v in full_counts.items() if v > 1]
    summary = {
        "schemaVersion": 1,
        "createdAtUtc": datetime.now(timezone.utc).isoformat(),
        "analysisStatus": "exploratory-reused-history-no-fresh-holdout",
        "source": {"file": str(Path(args.source)), "firstRound": draws[0]["round"],
                   "lastRound": draws[-1]["round"], "firstDate": draws[0]["date"],
                   "lastDate": draws[-1]["date"], "drawCount": n,
                   "officialPage": source["metadata"]["sourcePageUrl"]},
        "method": {
            "lags": LAGS, "mainBallsOnly": True, "ruleCount": family_tests,
            "singleNumberRules": len(LAGS)*45*45, "antecedentPairRules": len(LAGS)*990*45,
            "permutations": args.permutations, "seed": SEED,
            "null": "The observed whole draws are exchangeable across time; permute full six-number rows together.",
            "score": "Absolute hypergeometric-standardized residual of conditional hit count; score only, no Fisher or Gaussian p-value.",
            "multiplicity": "One joint maximum over all 558900 single/pair rules and all 12 lags in every permutation.",
            "pFormula": "(1 + number of permutation maxima >= observed absolute score)/(B+1)",
            "overlapMultiplicity": "Mean-overlap p-values adjusted over the separate family of 12 lags.",
            "limits": [
                "Temporal association is not a causal effect or evidence that a draw mechanism has memory.",
                "A whole-draw exchangeability test conditions on observed draws; it does not prove fairness or any future predictability.",
                "The final 104 draws were already inspected in earlier work. All new historical results reuse evaluated data and are exploratory.",
                "Conditional rates are selected on the same history and inflated by search; they are not future probabilities.",
                "Pair-to-number association does not determine the joint probability of an entire six-number set.",
                "999 permutations resolve p-values only in increments of 0.001; Monte Carlo uncertainty remains.",
            ],
        },
        "globalAssociationTest": {
            "observedMaxAbsoluteResidual": observed_joint_max,
            "observedMaxSingleAbsoluteResidual": observed_single,
            "observedMaxPairAbsoluteResidual": observed_pair,
            "singleFamilyPermutationP": p_of(observed_single, permutation_max[:, 0]),
            "pairFamilyPermutationP": p_of(observed_pair, permutation_max[:, 1]),
            "individualFamilyPValuesNote": "Each controls its own full family across all lags; the joint familywisePermutationP controls the entire search.",
            "permutationExceedances": exceedances,
            "familywisePermutationP": p_of(observed_joint_max),
            "monteCarloTailProbability95Interval": exact_interval(exceedances, args.permutations),
            "permutationMaxQuantiles": dict(zip(["50%", "90%", "95%", "99%"], np.quantile(joint_max, [.5, .9, .95, .99]))),
        },
        "fullSixPattern": {
            "possibleCombinations": total_combinations,
            "perTicketFirstPrizeProbability": 1/total_combinations,
            "distinctHistoricalCombinations": len(full_counts),
            "duplicatedCombinations": duplicated_full,
            "chanceOfAnyRepeatedFullCombinationIn522FairDraws": -math.expm1(sum(math.log1p(-i/total_combinations) for i in range(n))),
            "expectedFullCombinationRepeatPairs": math.comb(n, 2)/total_combinations,
            "historyCoverage": len(full_counts)/total_combinations,
            "fixedIndependentOneTicketPerDrawChanceOfAtLeastOneFirstPrizeIn522Draws": -math.expm1(n*math.log1p(-1/total_combinations)),
            "interpretation": "Without repeated full-six antecedents, history cannot estimate a repeatable conditional next-draw distribution for a specified six-number state.",
        },
        "patternRecurrence": recurrence,
        "pairSupportByLag": support_per_lag,
        "lagOverlap": lag_overlap,
        "topPositiveRules": sorted(candidates_positive, key=lambda r: r["standardizedResidual"], reverse=True)[:20],
        "topNegativeRules": sorted(candidates_negative, key=lambda r: r["standardizedResidual"])[:20],
        "topRulesByLag": top_per_lag,
        "elapsedSeconds": time.monotonic()-started,
    }
    write_json(out / "lag-associations-summary.json", summary)
    # All exact conditional counts and all permutation maxima are retained for independent auditing.
    raw = {"schemaVersion": 1, "singleAntecedents": list(range(1, 46)),
           "pairAntecedents": [[a+1, b+1] for a, b in all_pairs],
           "targetNumbers": list(range(1, 46)),
           "records": records,
           "permutationMaxAbsoluteResidualSingleAndPair": permutation_max,
           "permutationLagMeanOverlap": permutation_overlap}
    write_json(out / "lag-associations-all-counts.json", raw, pretty=False)
    # Compact result omits rule-source round lists and bulky recurrence histograms.
    compact = {k: summary[k] for k in ["schemaVersion", "analysisStatus", "source", "method",
               "globalAssociationTest", "fullSixPattern", "pairSupportByLag", "lagOverlap"]}
    compact["patternRecurrence"] = [{k: v for k, v in r.items() if not k.startswith("histogram")} for r in recurrence]
    compact["topPositiveRules"] = [{k: v for k, v in r.items() if k not in ["sourceRounds", "hitTargetRounds"]}
                                   for r in summary["topPositiveRules"][:8]]
    compact["topNegativeRules"] = [{k: v for k, v in r.items() if k not in ["sourceRounds", "hitTargetRounds"]}
                                   for r in summary["topNegativeRules"][:4]]
    write_json(out / "lag-associations-ui.json", compact)
    print(json.dumps(clean_json({"global": summary["globalAssociationTest"],
                                "topPositive": compact["topPositiveRules"][:3],
                                "fullSix": summary["fullSixPattern"],
                                "lagOverlap": lag_overlap,
                                "elapsedSeconds": time.monotonic()-started}), ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
