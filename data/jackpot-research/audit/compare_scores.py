import json
from pathlib import Path
from compare_cardinalities import ID_MAP

here=Path(__file__).resolve().parent
node=json.loads((here/'node-score-audit-samples.json').read_text(encoding='utf-8'))
independent=json.loads((here/'independent-scoring-reconstruction.json').read_text(encoding='utf-8'))
mapping={'uniform':'uniform',**ID_MAP,'type_mixture':'equalMixture'}
assert len(node['rows'])==len(independent['allRecords'])==366
checks=0
max_p_error=max_log_error=0
for actual,expected in zip(node['rows'],independent['allRecords']):
    assert actual['round']==expected['round']
    assert actual['historyFirstRound']==expected['historyFirstRound']
    assert actual['historyLastRound']==expected['historyLastRound']<actual['round']
    for model,score in actual['scores'].items():
        independent_id=mapping[model]
        p_error=abs(score['experimentalTicketProbability']-expected['experimentalProbabilityByModel'][independent_id])
        log_error=abs(score['jointLogGain']-expected['logRelativeLikelihoodByModel'][independent_id])
        max_p_error=max(max_p_error,p_error)
        max_log_error=max(max_log_error,log_error)
        assert p_error<1e-20,(actual['round'],model,p_error)
        assert log_error<1e-12,(actual['round'],model,log_error)
        if independent_id in expected['typeDetails']:
            detail=expected['typeDetails'][independent_id]
            assert score['categoryCardinality']==detail['categoryCardinality']
            assert score['trainingCategoryCount']==detail['historicalTypeCount']
            assert abs(score['categoryProbability']-detail['experimentalTypeMass'])<1e-12
        checks+=1
result={k:v for k,v in node.items()if k!='rows'}
result.update({'passed':True,'independentPerTicketScoreComparisons':checks,'draws':366,'models':12,
               'maxAbsoluteProbabilityError':max_p_error,'maxAbsoluteLogScoreError':max_log_error,
               'independentDevelopmentDraws':262,'independentReusedHistoricalTestDraws':104,
               'importantInterpretation':'A likelihood score ratio is not an established future jackpot probability multiplier.'})
(here/'scoring-audit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
