"""Exact cumulative coverage for six-number blocks with pairwise overlap<=1.

This is inclusion-exclusion over events of at least3 main-number matches.
The independent exhaustive draw enumerator is exact_portfolio_audit.js.
"""
from itertools import combinations
from math import comb

TOTAL=8145060

def linear_coverage(tickets):
    tickets=[set(t) for t in tickets]
    if any(len(t)!=6 or min(t)<1 or max(t)>45 for t in tickets):raise ValueError('Invalid ticket')
    m=len(tickets)
    edges={}
    for a,b in combinations(range(m),2):
        overlap=tickets[a]&tickets[b]
        if len(overlap)>1:raise ValueError('Pair overlap exceeds1')
        if overlap:edges[a,b]=next(iter(overlap))
    triangles=0
    for triple in combinations(range(m),3):
        labels=[edges.get(pair) for pair in combinations(triple,2)]
        triangles+=None not in labels and len(set(labels))==3
    k4=0
    for quad in combinations(range(m),4):
        labels=[edges.get(pair) for pair in combinations(quad,2)]
        k4+=None not in labels and len(set(labels))==6
    favorable3=m*194130-400*comb(m,2)-3300*len(edges)+64*triangles-k4
    return {'games':m,'overlappingPairs':len(edges),'bergeTriangles':triangles,'bergeK4s':k4,
            'favorable':{3:favorable3,4:m*11350,5:m*235,6:m},
            'probability':{3:favorable3/TOTAL,4:m*11350/TOTAL,5:m*235/TOTAL,6:m/TOTAL}}

PROOF={
    'singleEvent':'Each ticket succeeds on194130 draws.',
    'twoEvents':'For ticket overlap0, both succeed on400 draws; for overlap1, both succeed on3700 draws.',
    'threeEvents':'Both overlaps must be used to reach3hits on each ticket with just6drawn numbers. A three-way intersection exists iff all3 pair-intersection numbers exist and differ; those3 points plus one of4remaining points from each ticket give4^3=64 draws.',
    'fourEvents':'A four-way intersection requires each of6drawn points to contribute exactly2 hits: the6distinct pair intersections in a BergeK4. There is exactly1 such draw.',
    'noFiveEvents':'Ifw tickets each hit at least3, select3matching numbers per ticket. These are triples on the6drawn numbers, any two meeting in at most1point. At each point at most floor(5/2)=2triples can meet, since each needs2different other points. Counting incidences gives3w<=6*2, hencew<=4.',
    'conclusion':'Inclusion-exclusion terminates at four events: m*194130-400*C(m,2)-3300*overlappingPairs+64*BergeTriangles-BergeK4s.'
}

if __name__=='__main__':
    import json
    from pathlib import Path
    here=Path(__file__).resolve().parent
    data=json.loads((here/'exhaustive-template-results.json').read_text(encoding='utf-8'))['results']
    result={}
    for name,exhaustive in data.items():
        formula=linear_coverage(exhaustive['tickets'])
        for threshold,count in formula['favorable'].items():
            assert exhaustive['thresholds'][str(threshold)]['favorable']==count,(name,threshold,count)
        result[name]=formula
    verification={'passed':True,'cases':len(result),'proof':PROOF,'results':result}
    (here/'linear-formula-verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(verification,ensure_ascii=False,indent=2))
