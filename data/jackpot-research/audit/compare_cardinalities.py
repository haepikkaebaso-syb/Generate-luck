import json
from pathlib import Path
from independent_type_counts import TOTAL,SUM_BOUNDS

HERE=Path(__file__).resolve().parent
THEIRS=Path(r'C:\Users\Public\Documents\ESTsoft\CreatorTemp\lotto-jackpot-types-20260913')
ID_MAP={'odd_count':'odd','low_count':'low22','sum_bin':'sum','adjacent_pairs':'adjacent',
        'last_digit_distinct':'lastDigitDistinct','prime_count':'prime','decade_occupancy':'decade',
        'span_bin':'span','joint_sum_odd_adjacent':'sumOddAdjacent','joint_sum_odd_low':'sumOddLow'}
SUM_KEYS=[f'{lo}-{hi}'for lo,hi in SUM_BOUNDS]
SPAN_KEYS=['0-19','20-29','30-39','40-44']

def our_key(feature,category):
    if feature=='sum':return str(SUM_KEYS.index(category['key']))
    if feature=='span':return str(SPAN_KEYS.index(category['key']))
    if feature=='sumOddAdjacent':return f"{category['sumBin']},{category['odd']},{category['adjacent']}"
    if feature=='sumOddLow':return f"{category['sumBin']},{category['odd']},{category['low']}"
    return category['key']

def main():
    independent=json.loads((HERE/'independent-type-counts.json').read_text(encoding='utf-8'))
    actual=json.loads((THEIRS/'exact-type-cardinalities.json').read_text(encoding='utf-8'))
    checks=[]
    for partition in actual['partitions']:
        feature=ID_MAP[partition['id']]
        expected=independent['counts'][feature]
        for category in partition['categories']:
            key=our_key(feature,category)
            count=expected.get(key,0)
            assert count==category['cardinality'],(feature,key,count,category['cardinality'])
            assert abs(category['theoreticalProbability']-count/TOTAL)<1e-14
            assert category['possible']==(count>0)
        assert sum(c['cardinality']for c in partition['categories'])==TOTAL
        checks.append({'id':partition['id'],'allDefinedCells':len(partition['categories']),
                       'positiveCells':sum(c['possible']for c in partition['categories']),'allCellsMatch':True})
    result={'passed':True,'method':'Analytic/DP independent counts compared cell-for-cell to exhaustive Node enumeration.',
            'partitions':checks,'checkedCells':sum(c['allDefinedCells']for c in checks),'total':TOTAL}
    (HERE/'cardinality-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
