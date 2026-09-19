"""Reproducible descriptive analysis of official Lotto 6/45 records.

All numerical expectations derive from drawing six distinct numbers uniformly
from 1..45, with independent weekly draws. No selection/prediction is fitted.
"""
import collections
import datetime as dt
import hashlib
import itertools
import json
import math
import pathlib
import statistics
import sys

from scipy.stats import binomtest, chi2

ROOT = pathlib.Path(__file__).resolve().parent.parent/'data'
SOURCE = pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'draws.json'
obj = json.loads(SOURCE.read_text(encoding='utf-8'))
meta, draws = obj['metadata'], obj['draws']
N = len(draws)
TOTAL = math.comb(45,6)

def validation():
    failures=[]
    rounds=[d['round'] for d in draws]
    dates=[dt.date.fromisoformat(d['date']) for d in draws]
    checks = {
        'uniqueRounds':len(set(rounds))==N,
        'ascendingContiguousRounds':rounds==list(range(rounds[0],rounds[-1]+1)),
        'weeklySaturdayDates':all(d.weekday()==5 for d in dates) and all((b-a).days==7 for a,b in zip(dates,dates[1:])),
        'datesConsistentWithRoundOne':all(d==dt.date(2002,12,7)+dt.timedelta(days=7*(r-1)) for d,r in zip(dates,rounds)),
        'mainNumbersExactlySixUniqueSortedInRange':all(len(d['numbers'])==6 and len(set(d['numbers']))==6 and d['numbers']==sorted(d['numbers']) and all(type(v) is int and 1<=v<=45 for v in d['numbers']) for d in draws),
        'bonusSeparateAndInRange':all(type(d['bonus']) is int and 1<=d['bonus']<=45 and d['bonus'] not in d['numbers'] for d in draws),
        'metadataCountAndEndpointsMatch':meta['drawCount']==N and meta['firstRound']==rounds[0] and meta['lastRound']==rounds[-1] and meta['firstDrawDate']==draws[0]['date'] and meta['lastDrawDate']==draws[-1]['date'],
    }
    start=dt.date.fromisoformat(meta['requestedStartDate'])
    end=dt.date.fromisoformat(meta['requestedEndDate'])
    first=start+dt.timedelta(days=(5-start.weekday())%7)
    last=end-dt.timedelta(days=(end.weekday()-5)%7)
    expected=(last-first).days//7+1
    checks['requestedWindowComplete']=dates[0]==first and dates[-1]==last and N==expected
    checks['allDatesInsideRequestedWindow']=all(start<=d<=end for d in dates)
    manifest=json.loads((SOURCE.parent/'source-manifest.json').read_text(encoding='utf-8'))['requests']
    raw_rows={}
    hash_matches=0
    for request in manifest:
        content=(SOURCE.parent/request['file']).read_bytes()
        if hashlib.sha256(content).hexdigest()==request['sha256'] and len(content)==request['bytes']:
            hash_matches+=1
        if request['file'].endswith('.json'):
            rows=json.loads(content)['data']['list']
            for row in rows:
                r=int(row['ltEpsd'])
                if r in raw_rows and raw_rows[r]!=row:
                    failures.append(f'Raw API response conflict for round {r}')
                raw_rows[r]=row
    checks['allManifestByteLengthsAndSha256Match']=hash_matches==len(manifest)
    matches=0
    for draw in draws:
        row=raw_rows.get(draw['round'])
        if row is None:
            failures.append(f'Raw API record missing for round {draw["round"]}')
            continue
        normalized={'round':int(row['ltEpsd']), 'date':dt.datetime.strptime(row['ltRflYmd'],'%Y%m%d').date().isoformat(),
                    'numbers':[int(row[f'tm{i}WnNo']) for i in range(1,7)], 'bonus':int(row['bnsWnNo']),
                    'firstPrizeWinners':int(row['rnk1WnNope']), 'firstPrizePerWinner':int(row['rnk1WnAmt'])}
        if normalized==draw:
            matches+=1
        else:
            failures.append(f'Normalized/raw mismatch for round {draw["round"]}')
    checks['allNormalizedRecordsMatchRetainedOfficialRawApi']=matches==N
    assert all(checks.values()) and not failures, (checks,failures)
    return {'allPassed':True,'checks':checks,'expectedWeeklyDrawCount':expected,'actualDrawCount':N,
            'missingDrawCount':expected-N,'rawResponseFilesHashVerified':hash_matches,'rawDrawRowsReconciled':matches,
            'datasetSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'failures':failures}

validated=validation()
frequency=collections.Counter(n for d in draws for n in d['numbers'])
frequency52=collections.Counter(n for d in draws[-52:] for n in d['numbers'])
frequency156=collections.Counter(n for d in draws[-156:] for n in d['numbers'])
bonus_frequency=collections.Counter(d['bonus'] for d in draws)
annual=[]
for year in sorted(set(d['date'][:4] for d in draws)):
    year_draws=[d for d in draws if d['date'].startswith(year)]
    c=collections.Counter(n for d in year_draws for n in d['numbers'])
    year_start,year_end=dt.date(int(year),1,1),dt.date(int(year),12,31)
    first_sat=year_start+dt.timedelta(days=(5-year_start.weekday())%7)
    last_sat=year_end-dt.timedelta(days=(year_end.weekday()-5)%7)
    annual.append({'year':int(year),'drawCount':len(year_draws),'firstDate':year_draws[0]['date'],'lastDate':year_draws[-1]['date'],
        'completeCalendarYear':year_draws[0]['date']==first_sat.isoformat() and year_draws[-1]['date']==last_sat.isoformat(),
        'expectedPerNumber':len(year_draws)*6/45,'counts':[c[n] for n in range(1,46)],'numberOrder':list(range(1,46))})

numbers=[]
for n in range(1,46):
    appearances=[i for i,d in enumerate(draws) if n in d['numbers']]
    completed_gaps=[{'absentDraws':b-a-1,'previousAppearanceRound':draws[a]['round'],'nextAppearanceRound':draws[b]['round'],
                     'leftCensored':False,'rightCensored':False} for a,b in zip(appearances,appearances[1:])]
    left={'absentDraws':appearances[0],'fromRound':draws[0]['round'],'nextAppearanceRound':draws[appearances[0]]['round'],'leftCensored':True,'rightCensored':False}
    right={'absentDraws':N-1-appearances[-1],'previousAppearanceRound':draws[appearances[-1]]['round'],'throughRound':draws[-1]['round'],'leftCensored':False,'rightCensored':True}
    max_gap=max(g['absentDraws'] for g in completed_gaps+[left,right])
    test=binomtest(frequency[n],N,6/45)
    ci=test.proportion_ci(confidence_level=.95,method='exact')
    numbers.append({'number':n,'count':frequency[n],'expectedCount':N*6/45,'rate':frequency[n]/N,
        'recent52Count':frequency52[n],'recent52Expected':52*6/45,'recent156Count':frequency156[n],'recent156Expected':156*6/45,
        'currentGap':N-1-appearances[-1],'lastSeenRound':draws[appearances[-1]]['round'],'lastSeenDate':draws[appearances[-1]]['date'],
        'maximumCompletedGap':max(g['absentDraws'] for g in completed_gaps),
        'maximumObservedAbsenceRunIncludingCensoredEnds':max_gap,
        'maximumObservedAbsenceRunDetails':[g for g in completed_gaps+[left,right] if g['absentDraws']==max_gap],
        'leftCensoredInitialAbsenceRun':left,'rightCensoredCurrentAbsenceRun':right,
        'binomialTwoSidedP':test.pvalue,'bonferroni45AdjustedP':min(1,45*test.pvalue),
        'significantAfterBonferroni45At005':bool(test.pvalue<=.05/45),
        'rateConfidence95ExactUnadjusted':{'low':ci.low,'high':ci.high},'bonusCountSeparately':bonus_frequency[n]})

expected=N*6/45
q=sum((frequency[n]-expected)**2/expected for n in range(1,46))
corrected_q=q*44/39
uniformity={'pearsonQ':q,'withinDrawCovarianceFactor':39/44,'correctedQ':corrected_q,'degreesOfFreedom':44,
    'asymptoticChiSquaredP':float(chi2.sf(corrected_q,44)),
    'method':'For 6 distinct numbers sampled from 45, the count covariance is 39/44 times the multinomial covariance for 6N independent categorical draws; scale Pearson Q by 44/39. Chi-square reference is asymptotic, not an exact finite-sample test.',
    'numberTests':'45 two-sided exact Binomial(N,6/45) tests; Bonferroni familywise adjustment across numbers; alpha=0.05.',
    'numberTestsSignificantAfterBonferroni45':[n['number'] for n in numbers if n['significantAfterBonferroni45At005']]}

pair_counts=collections.Counter(p for d in draws for p in itertools.combinations(d['numbers'],2))
pairs=[]
for pair in itertools.combinations(range(1,46),2):
    count=pair_counts[pair]
    p=binomtest(count,N,1/66).pvalue
    pairs.append({'numbers':list(pair),'count':count,'expectedCount':N/66,'binomialTwoSidedP':p,
                  'bonferroni990AdjustedP':min(1,990*p),'significantAfterBonferroni990At005':bool(p<=.05/990)})
pairs.sort(key=lambda x:(-x['count'],x['numbers']))

def distribution(counts,probabilities,sample_size):
    return [{'value':k,'count':counts[k],'proportion':counts[k]/sample_size,'theoreticalProbability':p,'expectedCount':p*sample_size}
            for k,p in enumerate(probabilities)]

odd_counts=collections.Counter(sum(n%2 for n in d['numbers']) for d in draws)
odd_prob=[math.comb(23,k)*math.comb(22,6-k)/TOTAL for k in range(7)]
odd_dist=distribution(odd_counts,odd_prob,N)

sum_counts=collections.Counter(sum(d['numbers']) for d in draws)
sums=[sum(d['numbers']) for d in draws]
dp=[collections.Counter() for _ in range(7)]
dp[0][0]=1
for n in range(1,46):
    for k in range(6,0,-1):
        for prior,count in list(dp[k-1].items()):
            dp[k][prior+n]+=count
assert sum(dp[6].values())==TOTAL
sum_bins=[]
for lo,hi in [(21,60),(61,80),(81,100),(101,120),(121,140),(141,160),(161,180),(181,200),(201,220),(221,255)]:
    count=sum(v for s,v in sum_counts.items() if lo<=s<=hi)
    total=sum(v for s,v in dp[6].items() if lo<=s<=hi)
    sum_bins.append({'from':lo,'to':hi,'count':count,'proportion':count/N,'theoreticalProbability':total/TOTAL,'expectedCount':N*total/TOTAL})

consecutive_count=sum(any(b==a+1 for a,b in zip(d['numbers'],d['numbers'][1:])) for d in draws)
consecutive_probability=1-math.comb(40,6)/TOTAL
consecutive_test=binomtest(consecutive_count,N,consecutive_probability)

repeat_counts=collections.Counter(len(set(a['numbers'])&set(b['numbers'])) for a,b in zip(draws,draws[1:]))
repeat_prob=[math.comb(6,k)*math.comb(39,6-k)/TOTAL for k in range(7)]
repeat_dist=distribution(repeat_counts,repeat_prob,N-1)

result={
    'schemaVersion':1,'analysisType':'descriptive-only','data':meta,'independentValidation':validated,
    'model':{'sampleSpaceSize':TOTAL,'mainNumbersPerDraw':6,'poolSize':45,'drawIndependenceAssumed':True,
        'singleNumberProbabilityPerDraw':6/45,'singlePairProbabilityPerDraw':1/66,
        'exactTicketRank1Probability':1/TOTAL,
        'singleTicketAtLeastThreeMainMatchesProbability':sum(math.comb(6,k)*math.comb(39,6-k) for k in range(3,7))/TOTAL,
        'notes':'Probability statements refer to a fair draw with six unique main numbers; bonus is excluded from all main-number frequencies and feature counts.'},
    'numberFrequency':numbers,'frequencyUniformity':uniformity,
    'recentWindows':{'last52':{'firstRound':draws[-52]['round'],'lastRound':draws[-1]['round'],'drawCount':52},
                     'last156':{'firstRound':draws[-156]['round'],'lastRound':draws[-1]['round'],'drawCount':156}},
    'pairCooccurrence':{'pairCount':990,'top15':pairs[:15],'expectedCountPerPair':N/66,
        'significantPairsAfterBonferroni990At005':[p for p in pairs if p['significantAfterBonferroni990At005']],
        'interpretation':'Exploratory ranking selected from 990 pairs. Individual unadjusted p-values cannot establish an exceptional pair after this selection; adjusted p-values control the family of 990 fixed-pair tests. High past cooccurrence is not evidence of greater future odds.'},
    'oddNumberCount':{'distribution':odd_dist,'formula':'P(K=k)=C(23,k)*C(22,6-k)/C(45,6)'},
    'sum':{'mean':statistics.mean(sums),'sampleStandardDeviation':statistics.stdev(sums),'median':statistics.median(sums),
        'minimumObserved':min(sums),'maximumObserved':max(sums),'theoreticalMean':138,
        'theoreticalVariance':897,'theoreticalStandardDeviation':math.sqrt(897),
        'bins':sum_bins,'exactDistribution':[{'sum':s,'combinationCount':dp[6][s],'theoreticalProbability':dp[6][s]/TOTAL,'observedCount':sum_counts[s]} for s in range(21,256)],
        'method':'Exact 6-number subset-sum distribution computed by dynamic programming; variance=6*((45^2-1)/12)*(45-6)/(45-1).'},
    'consecutive':{'drawsWithAtLeastOneConsecutivePair':consecutive_count,'drawCount':N,'observedRate':consecutive_count/N,
        'theoreticalRate':consecutive_probability,'expectedCount':N*consecutive_probability,'binomialTwoSidedPUnadjusted':consecutive_test.pvalue,
        'formula':'1-C(40,6)/C(45,6)','notes':'Feature-level exploratory p-value is unadjusted; consecutive numbers are a normal outcome of random sampling.'},
    'previousDrawRepeats':{'transitionCount':N-1,'distribution':repeat_dist,'observedMeanRepeats':sum(k*v for k,v in repeat_counts.items())/(N-1),
        'theoreticalMeanRepeats':.8,'formula':'P(K=k)=C(6,k)*C(39,6-k)/C(45,6)',
        'notes':'Only adjacent draw pairs both inside the requested 10-year window are used.'},
    'annualFrequency':annual,
    'methodology':[
        'Use the official public API dataset for dates 2016-09-13 through 2026-09-13 inclusive; no Excel records or fitted selection weights are used.',
        'Independently validate every row against retained raw official responses and verify every source-manifest SHA256 hash.',
        'Treat each draw as six distinct main numbers selected uniformly from 1..45; all exact combinatorial expectations are unconditional.',
        'Numberwise significance uses exact two-sided Binomial(N,6/45) tests with Bonferroni across 45. Pairwise significance uses Binomial(N,1/66) with Bonferroni across 990.',
        'The frequency goodness-of-fit statistic is adjusted for sampling six distinct numbers within each draw; its chi-square p-value is asymptotic.',
        'Current gap is the number of completed draws after last appearance (0 when present in the latest draw); this is right-censored. Longest completed absence counts only draws strictly between two appearances.',
        'Maximum observed absence runs also include window-edge runs; left- and right-censoring are explicitly marked, since the full duration beyond the window is unknown.',
        'Calendar-year heatmaps show draw counts and flag partial years, so unequal observation time is visible.',
        'Sum probabilities are enumerated exactly by subset-sum dynamic programming; odd/even, consecutive, and overlap distributions follow combinatorial counts.'
    ],
    'limitations':[
        'Descriptive differences and small p-values do not establish exploitable bias, causal mechanisms, or improved future prediction.',
        'A fair independent draw makes each exact six-number ticket equally likely; past hot/cold frequencies or long gaps do not alter that probability.',
        'Number and pair multiple-test families are corrected separately. Feature analyses and alternative windows remain exploratory; the whole analysis is not one globally corrected confirmatory experiment.',
        'Confidence intervals reported for each number are unadjusted 95% Clopper-Pearson intervals and are not simultaneous 45-number intervals.',
        'The data checks detect missing, malformed, conflicting, or transformed records, but cannot independently audit the physical lottery drawing equipment.',
        'Choosing only common-looking odd/even, sum, or adjacency patterns removes valid equally likely tickets. A pattern category is more common because it contains more combinations, not because each combination has better odds.',
        'A claim of predictive gain requires a preregistered, leakage-free out-of-sample evaluation against a uniform baseline, with enough data and adjustment for strategy selection.'
    ]
}

# Conservation identities provide independently interpretable sanity checks.
assert sum(n['count'] for n in numbers)==N*6
assert sum(pair_counts.values())==N*15
assert sum(x['count'] for x in odd_dist)==N
assert sum(x['count'] for x in sum_bins)==N
assert sum(x['count'] for x in repeat_dist)==N-1
assert abs(sum(odd_prob)-1)<1e-12 and abs(sum(repeat_prob)-1)<1e-12
assert abs(sum(s*c for s,c in dp[6].items())/TOTAL-138)<1e-12
assert abs(sum((s-138)**2*c for s,c in dp[6].items())/TOTAL-897)<1e-12
out=ROOT/'analysis.json'
out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
summary={
    'drawCount':N,'first':draws[0],'last':draws[-1],'validation':validated,
    'highFrequency':sorted(numbers,key=lambda n:(-n['count'],n['number']))[:5],
    'lowFrequency':sorted(numbers,key=lambda n:(n['count'],n['number']))[:5],
    'longestCurrentGaps':sorted(numbers,key=lambda n:(-n['currentGap'],n['number']))[:5],
    'frequencyUniformity':uniformity,'topPairs':pairs[:5],
    'oddCounts':[odd_counts[k] for k in range(7)],
    'sumMean':result['sum']['mean'],'sumStd':result['sum']['sampleStandardDeviation'],
    'consecutive':result['consecutive'],'repeats':[repeat_counts[k] for k in range(7)],
}
(ROOT/'descriptive-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k not in ('highFrequency','lowFrequency','longestCurrentGaps')},ensure_ascii=False,indent=2))
print('WROTE',out)
