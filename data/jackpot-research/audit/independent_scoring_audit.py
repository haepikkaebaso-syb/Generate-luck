"""Independent rolling type-model score reconstruction from exact DP counts."""
import json
import math
from collections import Counter
from pathlib import Path
from independent_type_counts import count_types,PRIMES,SUM_BOUNDS,TOTAL

FEATURES=['odd','low22','sum','adjacent','lastDigitDistinct','prime','decade','span','sumOddAdjacent','sumOddLow']
WINDOW=156
PRIOR=156

def classify(numbers):
    ordered=sorted(numbers)
    odd=sum(n%2 for n in ordered)
    low=sum(n<=22 for n in ordered)
    total=sum(ordered)
    sum_bin=next(i for i,(lo,hi)in enumerate(SUM_BOUNDS)if lo<=total<=hi)
    adjacent=sum(b-a==1 for a,b in zip(ordered,ordered[1:]))
    decade=[0]*5
    for n in ordered:decade[(n-1)//10]+=1
    span=ordered[-1]-ordered[0]
    span_bin=0 if span<20 else 1 if span<30 else 2 if span<40 else 3
    return {'odd':str(odd),'low22':str(low),'sum':str(sum_bin),'adjacent':str(adjacent),
            'lastDigitDistinct':str(len({n%10 for n in ordered})),
            'prime':str(sum(n in PRIMES for n in ordered)),'decade':','.join(map(str,decade)),
            'span':str(span_bin),'sumOddAdjacent':f'{sum_bin},{odd},{adjacent}',
            'sumOddLow':f'{sum_bin},{odd},{low}'}

def reconstruct(draws, exact_counts):
    classes=[classify(d['numbers'])for d in draws]
    records=[]
    for index in range(WINDOW,len(draws)):
        history=classes[index-WINDOW:index]
        assert len(history)==WINDOW
        probabilities={'uniform':1/TOTAL}
        detail={}
        for feature in FEATURES:
            counts=Counter(d[feature]for d in history)
            category=classes[index][feature]
            cardinality=exact_counts[feature][category]
            category_prior=cardinality/TOTAL
            prior_count=PRIOR*category_prior
            posterior_type_mass=(counts[category]+prior_count)/(len(history)+PRIOR)
            per_ticket_probability=posterior_type_mass/cardinality
            probabilities[feature]=per_ticket_probability
            detail[feature]={'category':category,'categoryCardinality':cardinality,
                'historicalTypeCount':counts[category],
                'fairTypeMass':category_prior,'experimentalTypeMass':posterior_type_mass,
                'experimentalPerTicketProbability':per_ticket_probability}
            normalized=sum((counts.get(cat,0)+PRIOR*size/TOTAL)/(len(history)+PRIOR)
                           for cat,size in exact_counts[feature].items())
            assert abs(normalized-1)<1e-12
        probabilities['equalMixture']=sum(probabilities.values())/11
        relative={k:p*TOTAL for k,p in probabilities.items()}
        records.append({'round':draws[index]['round'],'sourceIndex':index,
                        'historyFirstRound':draws[index-WINDOW]['round'],
                        'historyLastRound':draws[index-1]['round'],
                        'split':'development'if index<418 else'reusedHistoricalTest',
                        'experimentalProbabilityByModel':probabilities,
                        'relativeLikelihoodByModel':relative,
                        'logRelativeLikelihoodByModel':{k:math.log(x)for k,x in relative.items()},
                        'typeDetails':detail})
    return records

def main():
    here=Path(__file__).resolve().parent
    data=json.loads(Path(r'D:\로또 당첨번호 발생기\data\draws.json').read_text(encoding='utf-8-sig'))
    draws=data['draws']
    exact_counts=count_types()
    records=reconstruct(draws,exact_counts)
    result={}
    for split in ['development','reusedHistoricalTest','all']:
        rows=records if split=='all'else[r for r in records if r['split']==split]
        result[split]={model:{'draws':len(rows),'meanLogRelativeLikelihood':sum(r['logRelativeLikelihoodByModel'][model]for r in rows)/len(rows),
            'sumLogRelativeLikelihood':sum(r['logRelativeLikelihoodByModel'][model]for r in rows),
            'geometricMeanRelativeLikelihood':math.exp(sum(r['logRelativeLikelihoodByModel'][model]for r in rows)/len(rows))}
            for model in ['uniform']+FEATURES+['equalMixture']}
    # Manipulate every current/future target in a copy: roundt forecasts may
    # depend on previousnumbers only, although its evaluated type changes.
    first=records[0]
    assert first['historyLastRound']==draws[155]['round']<first['round']
    assert records[-1]['historyLastRound']==draws[-2]['round']
    result={'method':'Independent reconstruction using exact analytic/DP cardinalities, historical slices excluding each target, prior156 and rolling156.',
            'historyDrawCount':len(draws),'evaluatedDrawCount':len(records),'summary':result,
            'sampleRecords':[records[i]for i in [0,1,155,261,262,365]],
            'allRecords':records,
            'interpretation':[
                'Each model assigns type probability mass divided by the exact number of combinations within that type.',
                'The uniform+10type-model mixture averages probabilities, never logprobabilities.',
                'Geometric mean relative likelihood is a scoring metric, not a multiplier of future jackpot winning probability.',
                'Development262 and reused historical test104 are retrospective descriptive splits, not a fresh untouched holdout.',
                'Fair independent draws give every six-number set probability1/8145060 regardless ofits type.'
            ]}
    (here/'independent-scoring-reconstruction.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'summary':result['summary'],'records':len(records)},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
