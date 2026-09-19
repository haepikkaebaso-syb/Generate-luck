import json
from pathlib import Path
from independent_scoring_audit import classify
from compare_cardinalities import ID_MAP,SUM_KEYS,SPAN_KEYS

here=Path(__file__).resolve().parent
data=json.loads((here/'classification-samples-node.json').read_text(encoding='utf-8'))
count=0
for sample in data['samples']:
    expected=classify(sample['numbers'])
    for partition,category in sample['result']['byPartition'].items():
        feature=ID_MAP[partition]
        key=category['key']
        if feature=='sum':key=str(SUM_KEYS.index(key))
        elif feature=='span':key=str(SPAN_KEYS.index(key))
        elif feature in ['sumOddAdjacent','sumOddLow']:
            parts=key.split('|')
            key=','.join([str(SUM_KEYS.index(parts[0])),parts[1].split('=')[1],parts[2].split('=')[1]])
        assert expected[feature]==key,(sample['numbers'],partition,expected[feature],key)
        count+=1
result={'passed':True,'samples':len(data['samples']),'featureComparisons':count,'invalidInputsRejected':data['invalidRejected']}
(here/'classification-audit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
