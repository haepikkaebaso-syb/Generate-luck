"""Exact type cardinalities by combinatorics/dynamic programming.

No enumeration of all8,145,060 tickets and no use of historical results to define
partitions or count their sizes. All variables concern six main numbers only.
"""
from itertools import product
from math import comb
from pathlib import Path
import json
import time
import numpy as np

TOTAL=comb(45,6)
SUM_BOUNDS=[(21,89),(90,119),(120,149),(150,179),(180,255)]
PRIMES=[2,3,5,7,11,13,17,19,23,29,31,37,41,43]

def count_types():
    out={}
    for name,size in [('odd',23),('low22',22),('prime',14)]:
        out[name]={str(k):comb(size,k)*comb(45-size,6-k) for k in range(7)}
    out['adjacent']={str(a):comb(5,5-a)*comb(40,6-a)for a in range(6)}
    out['span']={str(b):sum((45-span)*comb(span-1,4)for span in range(max(5,lo),hi+1))
                 for b,(lo,hi)in enumerate([(0,19),(20,29),(30,39),(40,44)])}
    sizes=[10,10,10,10,5]
    out['decade']={','.join(map(str,counts)):int(np.prod([comb(s,c)for s,c in zip(sizes,counts)]))
                   for counts in product(range(7),repeat=5)
                   if sum(counts)==6 and all(c<=s for s,c in zip(sizes,counts))}
    # Last-digit groups: five groups ofsize5 andfive ofsize4.
    digit_dp={(0,0):1}
    for size in [5]*5+[4]*5:
        nxt={}
        for (picked,occupied),ways in digit_dp.items():
            for take in range(min(size,6-picked)+1):
                key=(picked+take,occupied+int(take>0))
                nxt[key]=nxt.get(key,0)+ways*comb(size,take)
        digit_dp=nxt
    out['lastDigitDistinct']={str(g):ways for (picked,g),ways in digit_dp.items()if picked==6}

    # Joint sum/odd/low count DP: include/exclude each integer1..45 once.
    low_dp=np.zeros((7,256,7,7),dtype=np.int64)
    low_dp[0,0,0,0]=1
    for number in range(1,46):
        odd,low=number%2,int(number<=22)
        nxt=low_dp.copy()
        nxt[1:,number:,odd:,low:]+=low_dp[:-1,:256-number,:7-odd,:7-low]
        low_dp=nxt
    low_final=low_dp[6]
    assert int(low_final.sum())==TOTAL
    out['sum']={}
    out['sumOddLow']={}
    for b,(lo,hi)in enumerate(SUM_BOUNDS):
        bin_counts=low_final[lo:hi+1].sum(axis=0)
        out['sum'][str(b)]=int(bin_counts.sum())
        for odd,low in product(range(7),repeat=2):
            if bin_counts[odd,low]:out['sumOddLow'][f'{b},{odd},{low}']=int(bin_counts[odd,low])

    # Joint sum/odd/adjacent DP additionally tracks whether the preceding integer
    # was included. A newly included integer creates one adjacent pair iff so.
    adj_dp=np.zeros((7,256,7,6,2),dtype=np.int64)
    adj_dp[0,0,0,0,0]=1
    for number in range(1,46):
        odd=number%2
        nxt=np.zeros_like(adj_dp)
        nxt[...,0]=adj_dp.sum(axis=-1)
        nxt[1:,number:,odd:,:,1]+=adj_dp[:-1,:256-number,:7-odd,:,0]
        nxt[1:,number:,odd:,1:,1]+=adj_dp[:-1,:256-number,:7-odd,:-1,1]
        adj_dp=nxt
    adj_final=adj_dp[6].sum(axis=-1)
    assert int(adj_final.sum())==TOTAL
    out['sumOddAdjacent']={}
    for b,(lo,hi)in enumerate(SUM_BOUNDS):
        bin_counts=adj_final[lo:hi+1].sum(axis=0)
        assert int(bin_counts.sum())==out['sum'][str(b)]
        for odd in range(7):
            for adjacent in range(6):
                if bin_counts[odd,adjacent]:out['sumOddAdjacent'][f'{b},{odd},{adjacent}']=int(bin_counts[odd,adjacent])
    assert {str(a):int(adj_final[:,:,a].sum())for a in range(6)}==out['adjacent']
    assert {str(o):int(adj_final[:,o,:].sum())for o in range(7)}==out['odd']
    assert {str(o):int(low_final[:,o,:].sum())for o in range(7)}==out['odd']
    assert {str(lo):int(low_final[:,:,lo].sum())for lo in range(7)}==out['low22']
    for name,counts in out.items():assert sum(counts.values())==TOTAL,(name,sum(counts.values()))
    return out

if __name__=='__main__':
    started=time.monotonic()
    counts=count_types()
    result={'method':'Analytic hypergeometric/run/span/product counts and integer include-exclude DPs, independent of exhaustive enumeration.',
            'totalCombinations':TOTAL,'definitions':{'sumBins':SUM_BOUNDS,'lowMaximum':22,'primes':PRIMES,'decadeGroupSizes':[10,10,10,10,5],
            'lastDigitGroupSizes':[5]*5+[4]*5,'spanBins':[[0,19],[20,29],[30,39],[40,44]],'adjacent':'Number of selected pairs differing by1, no wraparound.'},
            'counts':counts,'positiveCellCounts':{name:sum(v>0 for v in cells.values())for name,cells in counts.items()},
            'allPartitionsSumToTotal':True,'elapsedSeconds':time.monotonic()-started}
    out=Path(__file__).resolve().parent/'independent-type-counts.json'
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items()if k!='counts'},ensure_ascii=False,indent=2))
    print(json.dumps({k:counts[k]for k in ['odd','low22','prime','adjacent','span','lastDigitDistinct','sum']},indent=2))
