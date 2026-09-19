"""Independent report, bootstrap, selection, descriptive, and forecast audit."""
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
from statistics import NormalDist

import numpy as np
from independent_scoring_audit import classify
from independent_type_counts import TOTAL
from compare_cardinalities import ID_MAP,our_key

HERE=Path(__file__).resolve().parent
SOURCE=Path(r'C:\Users\Public\Documents\ESTsoft\CreatorTemp\lotto-jackpot-types-20260913\jackpot-type-report.json')

def mulberry32(seed):
    mask=0xffffffff
    while True:
        seed=(seed+0x6D2B79F5)&mask
        t=((seed^(seed>>15))*(seed|1))&mask
        t^=(t+((t^(t>>7))*(t|61)&mask))&mask
        yield ((t^(t>>14))&mask)/4294967296

def bootstrap(values,seed):
    n,k=values.shape
    rng=mulberry32(seed)
    results=np.empty((4000,k))
    for b in range(4000):
        selected=[]
        while len(selected)<n:
            start=int(next(rng)*n)
            selected.extend((start+j)%n for j in range(4))
        results[b]=values[np.array(selected[:n])].mean(axis=0)
    return results

def wilson(k,n):
    z=NormalDist().inv_cdf(.975)
    denominator=1+z*z/n
    center=(k/n+z*z/(2*n))/denominator
    half=z*math.sqrt(k/n*(1-k/n)/n+z*z/(4*n*n))/denominator
    return max(0,center-half),min(1,center+half),2*half

def main():
    raw=SOURCE.read_bytes()
    report=json.loads(raw)
    independent=json.loads((HERE/'independent-scoring-reconstruction.json').read_text(encoding='utf-8'))
    draws=json.loads(Path(r'D:\로또 당첨번호 발생기\data\draws.json').read_text(encoding='utf-8-sig'))['draws']
    features=[classify(d['numbers'])for d in draws]
    model_map={'uniform':'uniform',**ID_MAP,'type_mixture':'equalMixture'}
    ids=report['validation']['models']
    assert len(ids)==12
    scores_compared=0
    for actual,expected in zip(report['perRoundScores'],independent['allRecords']):
        assert actual['round']==expected['round']
        assert actual['index']==expected['sourceIndex']
        assert actual['stage']==expected['split']
        assert actual['trainingFirstRound']==expected['historyFirstRound']
        assert actual['trainingLastRound']==expected['historyLastRound']<actual['round']
        for model,score in actual['models'].items():
            independent_id=model_map[model]
            assert abs(score['experimentalTicketProbability']-expected['experimentalProbabilityByModel'][independent_id])<1e-20
            assert abs(score['jointLogGain']-expected['logRelativeLikelihoodByModel'][independent_id])<1e-12
            scores_compared+=1
    bootstrap_checks=0
    max_bootstrap_error=0
    for split,seed in [('development',20260913),('reusedHistoricalTest',20260914)]:
        rows=[r for r in independent['allRecords']if r['split']==split]
        values=np.array([[r['logRelativeLikelihoodByModel'][model_map[mid]]for mid in ids]for r in rows])
        samples=bootstrap(values,seed)
        for j,mid in enumerate(ids):
            summary=report['validation']['summary'][split][mid]
            assert summary['drawCount']==len(rows)
            assert abs(summary['meanJointLogGain']-values[:,j].mean())<1e-12
            for name,level in [('jointLogGainInterval95',.95),('jointLogGainIntervalAdjusted',1-.05/11)]:
                expected=np.quantile(samples[:,j],[(1-level)/2,1-(1-level)/2],method='linear')
                actual=summary[name]
                for endpoint,value in zip(['lower','upper'],expected):
                    error=abs(actual[endpoint]-value)
                    max_bootstrap_error=max(max_bootstrap_error,error)
                    assert error<1e-12,(split,mid,name,endpoint,error)
                    bootstrap_checks+=1
    selected=max(ids,key=lambda mid:independent['summary']['development'][model_map[mid]]['meanLogRelativeLikelihood'])
    assert report['validation']['selection']['selectedModel']==selected=='sum_bin'
    assert report['validation']['splits']['development']['count']==262
    assert report['validation']['splits']['reusedHistoricalTest']['count']==104
    assert report['validation']['splits']['reusedHistoricalTest']['freshHoldout']is False
    observed_checks=forecast_checks=wilson_checks=example_checks=0
    structural_zero_interval_issue=[]
    definitions={p['id']:{c['key']:c for c in p['categories']}for p in report['classification']['definitions']}
    for partition in report['descriptive']['partitions']:
        feature=ID_MAP[partition['id']]
        observed=Counter(row[feature]for row in features)
        recent=Counter(row[feature]for row in features[-156:])
        for category in partition['categories']:
            key=our_key(feature,category)
            count=observed[key]
            assert category['observedDrawCount']==count
            assert abs(category['expectedDrawCount']-522*category['cardinality']/TOTAL)<1e-12
            for example in category['knownDrawExamples']:
                assert classify(example['numbers'])[feature]==key
                actual=next(d for d in draws if d['round']==example['round'])
                assert actual['numbers']==example['numbers']and actual['date']==example['date']
                example_checks+=1
            if category['possible']:
                expected=wilson(count,522)
                for endpoint,value in zip(['lower','upper','width'],expected):
                    assert abs(category['observedRateWilson95'][endpoint]-value)<1e-12
                    wilson_checks+=1
            elif category.get('observedRateWilson95') and category['observedRateWilson95']['upper']>0:
                structural_zero_interval_issue.append(partition['id']+':'+category['key'])
            observed_checks+=1
        forecast=report['latestForecast']['byPartition'][partition['id']]
        assert forecast['trainingDrawCount']==156
        for category in forecast['categories']:
            definition=definitions[partition['id']][category['key']]
            key=our_key(feature,definition)
            cardinality=category['categoryCardinality']
            q=cardinality/TOTAL
            expected_pc=(recent[key]+156*q)/312
            assert category['trailingObservedCount']==recent[key]
            assert abs(category['modeledCategoryProbability']-expected_pc)<1e-12
            assert category['modelProbabilityIsVerifiedFutureChance']is False
            if category['possible']:
                assert abs(category['experimentalTicketProbability']-expected_pc/cardinality)<1e-20
                expected=wilson(recent[key],156)
                for endpoint,value in zip(['lower','upper','width'],expected):
                    assert abs(category['observedRateWilson95'][endpoint]-value)<1e-12
                    wilson_checks+=1
                if cardinality>=5:
                    assert abs(category['fiveDistinctTicketsSameCategory']['experimentalModelProbability']-5*expected_pc/cardinality)<1e-20
                    assert abs(category['fiveDistinctTicketsSameCategory']['fairProbability']-5/TOTAL)<1e-20
            else:
                assert category['experimentalTicketProbability']is None
            forecast_checks+=1
    positive_adjusted=[mid for mid in ids if mid!='uniform'and report['validation']['summary']['reusedHistoricalTest'][mid]['jointLogGainIntervalAdjusted']['lower']>0]
    result={'passed':not structural_zero_interval_issue,'source':str(SOURCE),'sourceSha256':hashlib.sha256(raw).hexdigest(),
            'allModelScoreComparisons':scores_compared,'independentBootstrapEndpointComparisons':bootstrap_checks,
            'maxBootstrapEndpointError':max_bootstrap_error,'observedTypeCountsCompared':observed_checks,
            'latestForecastTypeCountsAndProbabilitiesCompared':forecast_checks,'wilsonEndpointsCompared':wilson_checks,
            'historicalExamplesChecked':example_checks,'developmentSelectedModel':selected,
            'positiveReused104AdjustedIntervalModels':positive_adjusted,
            'structuralZeroIntervalIssueCount':len(structural_zero_interval_issue),
            'salient':{'selectedDevelopmentLogGain':report['validation']['selection']['developmentMeanJointLogGain'],
                       'selectedReused104LogGain':report['validation']['selection']['reusedHistoricalTestMeanJointLogGain'],
                       'selectedReused104Interval95':report['validation']['selection']['selectedTestInterval95'],
                       'mixtureReused104':report['validation']['summary']['reusedHistoricalTest']['type_mixture'],
                       'sum120to149Example':report['latestForecast']['examples']['sum120to149']},
            'inferenceLimits':[
                'Block4 percentile intervals are approximate descriptive uncertainty for reused history, not a fresh confirmation.',
                'Bonferroni adjustment across11 alternatives does not remove historical reuse, repeated analyses, or post-selection effects.',
                'A positive mean log likelihood score or its exponent is not a future jackpot probability improvement.',
                'No adjusted lower interval bound exceeds0 in the reused104; a high-probability jackpot ticket recommendation is unsupported.',
                'Large type probability must be divided by exact type cardinality before it can represent an individual-ticket probability under a type model.'
            ]}
    (HERE/'final-report-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items()if k not in ['salient']},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
