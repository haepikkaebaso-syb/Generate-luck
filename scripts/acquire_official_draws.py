"""Acquire public official Lotto 6/45 history via the API used by the official result page.
No Excel input or mirror data. Raw responses and SHA256 manifest retained.
"""
import datetime as dt
import hashlib
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

OUT=pathlib.Path(__file__).resolve().parent.parent/'data'
START=dt.date(2016,9,13)
END=dt.date(2026,9,13)
PAGE='https://m.dhlottery.co.kr/lt645/result'
API='https://m.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do'
RAW=OUT/'raw'
RAW.mkdir(exist_ok=True)
manifest=[]
def fetch(url, name):
    req=urllib.request.Request(url,headers={'Accept':'application/json,text/html;q=0.9','Referer':PAGE})
    with urllib.request.urlopen(req,timeout=30) as response:
        raw=response.read()
        assert response.status==200
        content_type=response.headers.get('Content-Type')
    (RAW/name).write_bytes(raw)
    manifest.append({'url':url,'file':'raw/'+name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'contentType':content_type})
    return raw
html=fetch(PAGE,'official-result-page.html').decode('utf-8')
latest=max(map(int,re.findall(r'class="option-il" data-value="(\d+)"',html)))
all_by_round={}
params={'srchDir':'center','srchLtEpsd':latest}
while True:
    cursor=params.get('srchLtEpsd') or params['srchCursorLtEpsd']
    url=API+'?'+urllib.parse.urlencode(params)
    obj=json.loads(fetch(url,f'{params["srchDir"]}-{cursor}.json'))
    rows=obj['data']['list']
    assert rows, 'Empty result before target start'
    prior_count=len(all_by_round)
    for row in rows:
        r=int(row['ltEpsd'])
        if r in all_by_round:
            assert all_by_round[r]==row,'Conflicting duplicate round'
        all_by_round[r]=row
    assert len(all_by_round)>prior_count,'No progress'
    oldest=min(all_by_round)
    if len(manifest)%10==0:
        print(f'Fetched {len(all_by_round)} official records; oldest round {oldest}',flush=True)
    if dt.datetime.strptime(all_by_round[oldest]['ltRflYmd'],'%Y%m%d').date()<START:
        break
    params={'srchDir':'older','srchCursorLtEpsd':oldest}
    time.sleep(.15)

draws=[]
for round_no,row in sorted(all_by_round.items()):
    day=dt.datetime.strptime(row['ltRflYmd'],'%Y%m%d').date()
    if not START<=day<=END:
        continue
    nums=[int(row[f'tm{i}WnNo']) for i in range(1,7)]
    bonus=int(row['bnsWnNo'])
    assert len(set(nums))==6 and nums==sorted(nums)
    assert len(set(nums+[bonus]))==7 and all(1<=x<=45 for x in nums+[bonus])
    assert day.weekday()==5
    draws.append({'round':round_no,'date':day.isoformat(),'numbers':nums,'bonus':bonus,
                  'firstPrizeWinners':int(row['rnk1WnNope']),'firstPrizePerWinner':int(row['rnk1WnAmt'])})
assert draws
for prev,nxt in zip(draws,draws[1:]):
    assert nxt['round']==prev['round']+1,'Missing round'
    assert dt.date.fromisoformat(nxt['date'])-dt.date.fromisoformat(prev['date'])==dt.timedelta(days=7),'Non-weekly dates'
first_saturday=START+dt.timedelta(days=(5-START.weekday())%7)
last_saturday=END-dt.timedelta(days=(END.weekday()-5)%7)
expected_count=(last_saturday-first_saturday).days//7+1
complete=draws[0]['date']==first_saturday.isoformat() and draws[-1]['date']==last_saturday.isoformat() and len(draws)==expected_count
metadata={
    'schemaVersion':1,'game':'Korean Lotto 6/45','requestedAsOf':'2026-09-13','timezone':'Asia/Seoul',
    'requestedStartDate':START.isoformat(),'requestedEndDate':END.isoformat(),
    'sourceName':'Donghaeng Lottery official public draw-result API','sourceType':'official-primary',
    'sourcePageUrl':PAGE,'sourceApiUrl':API,
    'sourceMethod':'GET; srchDir=center&srchLtEpsd=latest followed by srchDir=older&srchCursorLtEpsd=oldest. Endpoint and parameter names read from official result-page JavaScript.',
    'latestPublishedRoundAtRetrieval':latest,'firstRound':draws[0]['round'],'lastRound':draws[-1]['round'],
    'firstDrawDate':draws[0]['date'],'lastDrawDate':draws[-1]['date'],'drawCount':len(draws),
    'expectedDrawCount':expected_count,'completeRequestedWindow':complete,
    'retrievedAtUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'noExcelSource':True,
    'validation':{'uniqueRounds':True,'contiguousRounds':True,'weeklySaturdayDates':True,'numbersUniqueInRange':True,'bonusSeparate':True,'noDatesAfterAsOf':True,'officialResponseCopiesRetained':True},
    'manifestFile':'source-manifest.json','acquisitionScript':'acquire_official_draws.py'
}
(OUT/'draws.json').write_text(json.dumps({'metadata':metadata,'draws':draws},ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'source-manifest.json').write_text(json.dumps({'requests':manifest},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(metadata,ensure_ascii=False,indent=2))
print('FIRST',draws[0])
print('LAST',draws[-1])
