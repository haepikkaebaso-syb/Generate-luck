from __future__ import annotations
import math,itertools,json,pathlib,datetime
OUT=pathlib.Path(__file__).parent; N=math.comb(45,6)
K={k:sum(math.comb(6,j)*math.comb(39,6-j) for j in range(k,7)) for k in range(3,7)}
def uniform_distinct(m,k):return -math.expm1(sum(math.log1p(-K[k]/(N-i)) for i in range(m)))
def linear_counts(ts):
 ts=list(map(set,ts));m=len(ts);ints={(i,j):ts[i]&ts[j] for i,j in itertools.combinations(range(m),2)}
 assert all(len(s)<=1 for s in ints.values())
 n1=sum(bool(s)for s in ints.values());n0=math.comb(m,2)-n1
 def motifs(size,distinct):
  total=0
  for g in itertools.combinations(range(m),size):
   sets=[ints[e] for e in itertools.combinations(g,2)]
   total+=all(sets) and len(set.union(*sets))==distinct
  return total
 T=motifs(3,3);Q=motifs(4,6)
 return {3:m*K[3]-400*n0-3700*n1+64*T-Q,4:m*K[4],5:m*K[5],6:m},dict(overlap0Pairs=n0,overlap1Pairs=n1,nonconcurrentTriangles=T,distinctIntersectionK4s=Q)
def small_pool_counts(tickets):
 pool=sorted(set.union(*map(set,tickets)));p=len(pool);out={k:0 for k in K}
 for s in range(7):
  for x in itertools.combinations(pool,s):
   h=max(len(set(x)&set(t)) for t in tickets);w=math.comb(45-p,6-s) if 0<=6-s<=45-p else 0
   for k in K:
    if h>=k:out[k]+=w
 return out
def anchored_counts(m,a):
 petals=6-a;rest=45-a-m*petals;assert rest>=0;out={}
 for k in K:
  no=0
  for c in range(a+1):
   q=k-c
   if c>6 or q<=0:continue
   poly=[1]+[0]*6
   for _ in range(m):
    nxt=[0]*7
    for i in range(7):
     for j in range(min(petals,q-1,6-i)+1):nxt[i+j]+=poly[i]*math.comb(petals,j)
    poly=nxt
   no+=math.comb(a,c)*sum(poly[i]*math.comb(rest,6-c-i) for i in range(7) if 0<=6-c-i<=rest)
  out[k]=N-no
 return out
all_lines=[sorted(7*x+((a*x+b)%7)+1 for x in range(6)) for a in range(7) for b in range(7)]
assert len({tuple(t) for t in all_lines})==49
assert max(len(set(a)&set(b)) for a,b in itertools.combinations(all_lines,2))==1
raw=json.loads((OUT/'lotto-affine-portfolio-counts-20260913.json').read_text())
by_m=[]
for m in range(1,21):
 counts,diag=linear_counts(all_lines[:m]);assert counts[3]==raw['prefix'][m-1]['favorable3']
 row={'m':m,'costKRW':1000*m,'uniformDistinctMeanProbability':{k:uniform_distinct(m,k) for k in K},'exampleLinearDesign':{'tickets':all_lines[:m],'counts':counts,'probability':{k:counts[k]/N for k in K},'diagnostics':diag,'disjoint':m<=7},'universalUpperProbability':{k:m*K[k]/N for k in K},'elementaryStrongerUpperProbability3':(m*K[3]-400*(m-1))/N,'globalOptimumAttainedForThresholds':[4,5,6],'globalOptimumClaimedForThreshold3':False}
 by_m.append(row)
comparisons=[{'id':'uniformDistinct5','labelKo':'중복 없는 무작위 5게임의 평균','m':5,'probability':{k:uniform_distinct(5,k) for k in K}}, {'id':'disjoint5','labelKo':'30개 번호를 나눠 쓰는 완전 분산 5게임','m':5,'counts':{k:5*K[k]-(4000 if k==3 else 0) for k in K}}]
for a in range(1,6):comparisons.append({'id':f'common{a}Anchors5','labelKo':f'{a}개 공통 고정번호 + 나머지는 서로 겹치지 않는 5게임','m':5,'counts':anchored_counts(5,a)})
wheel7=[sorted(set(range(1,8))-{omit}) for omit in range(1,6)]
omitted=[(1,2),(3,4),(5,6),(7,8),(1,3)];wheel8=[sorted(set(range(1,9))-set(x)) for x in omitted]
for name,label,tickets in [('wheel7partial5','7개 후보 안에서 고른 서로 다른 5게임',wheel7),('wheel8partial5','8개 후보의 지정된 부분 휠링 5게임',wheel8),('wheel7full7','7개 후보의 모든 6개 조합: 7게임',list(itertools.combinations(range(1,8),6))),('wheel8full28','8개 후보의 모든 6개 조합: 28게임',list(itertools.combinations(range(1,9),6)))]:comparisons.append({'id':name,'labelKo':label,'m':len(tickets),'tickets':tickets,'counts':small_pool_counts(tickets)})
for r in comparisons:
 if 'counts'in r:r['probability']={k:v/N for k,v in r['counts'].items()}
intersections={}
for r in range(7):
 intersections[r]={}
 for k in K:
  total=0
  for c in range(r+1):
   for a in range(7-r):
    for b in range(7-r):
     z=6-c-a-b
     if c+a>=k and c+b>=k and 0<=z<=33+r:total+=math.comb(r,c)*math.comb(6-r,a)*math.comb(6-r,b)*math.comb(33+r,z)
  intersections[r][k]=total
facts={'createdAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'assumption':'공정한 독립 로또6/45 추첨, 해당 회차 전에 고른 유효한 6개 번호 조합. 회차 안의 본번호 6개는 중복 없이 선택.','outcomeCount':N,'thresholds':{3:'5등 이상: 본번호3개 이상',4:'4등 이상: 본번호4개 이상',5:'3등 이상: 본번호5개 이상(2등 포함)',6:'1등: 본번호6개 일치'},'singleTicketFavorableCounts':K,'pairIntersectionCountsBySharedTicketNumbers':intersections,'byTicketCount':by_m,'comparisons':comparisons,'fiveGameHeadroom':{'uniformDistinctProbability3':uniform_distinct(5,3),'disjointProbability3':(5*K[3]-4000)/N,'unionBound3':5*K[3]/N,'elementaryStrongerUpper3':(5*K[3]-1600)/N,'disjointGainVsRandomPercentagePoints':100*((5*K[3]-4000)/N-uniform_distinct(5,3)),'unionBoundHeadroomAboveDisjointPercentagePoints':4000/N*100,'strongerBoundHeadroomAboveDisjointPercentagePoints':2400/N*100,'relativeDisjointGainVsRandom':(5*K[3]-4000)/N/uniform_distinct(5,3)-1},'formulas':{'oneTicket':'K_k=sum(j=k..6) C(6,j)*C(39,6-j)','uniformDistinctAverage':'1-product(i=0..m-1)(1-K_k/(N-i))','disjointAtLeast3':'(m*K_3-400*C(m,2))/N, m<=7','pairwiseOverlapAtMost1AtLeast4':'m*K_k/N for k=4,5,6; globally maximal at given unique ticket count','linearAtLeast3':'[m*K_3-400*n0-3700*n1+64*T-Q]/N','linearTriangleDefinition':'T: three tickets have all three pairwise intersections present and on three distinct numbers','linearQuadrupleDefinition':'Q: four tickets have all six pairwise intersections present and on six distinct numbers','fullPoolWheel':'sum(r=k..6) C(poolSize,r)*C(45-poolSize,6-r)/N, uses C(poolSize,6) tickets','universalAtLeast3StrongerBound':'(m*K_3-400*(m-1))/N; non-achievability/optimality not established'},'verification':['All20 affine-prefix >=3 counts match existing independent event-union bitset enumeration.','Explicit K4 case matches bitset754575 favorable draws and mK-6*3700+4*64-1.','All5 common-anchor constructions >=3 counts match independent existing bitset coverage.','All49 constructed affine tickets are distinct, valid six-number sets, with maximum pair overlap1.'],'sources':[{'title':'동행복권 공식 로또6/45 소개·당첨구조','url':'https://m.dhlottery.co.kr/lt645/intro','supports':'1게임1000원,6/45구조,본번호3/4/5/6개 당첨 등위,2등보너스조건'},{'title':'László Székely, Notes on Inclusion-Exclusion and Indicator Functions','url':'https://people.math.sc.edu/laszlo/indicator1.pdf','supports':'포함배제 및 합집합 확률 경계의 기본 원리'},{'title':'Joy Morris, Combinatorics, Affine Planes','url':'https://math.libretexts.org/Bookshelves/Combinatorics_and_Discrete_Mathematics/Combinatorics_(Morris)/04:_Design_Theory/18:_More_Designs/18.03:_Affine_Planes','supports':'유한 평면에서 서로 다른 선의 교점 구조; 이 보고서의42점49티켓 구성과 수치는 직접 도출'}],'limitations':['>=3 분산5게임 및20게임 예제에 대한 전역 최적성은 주장하지 않음.','임의의 고정번호/제외번호가 있으면 pairwise-overlap<=1 설계가 불가능할 수 있음. 그때 표시하는 확률은 실제 생성된 티켓으로 재계산해야 함.','번호 재배치는 특정 번호의 미래 출현확률을 높이지 않음.','1등확률은 모든 서로 다른m게임에 대해 정확히m/N이며 번호 분산으로 추가 증가하지 않음.','적어도 하나 당첨될 확률의 증가와 평균 당첨 게임 수 증가는 다름. 후자는 모든m게임에서m*K_k/N로 동일.','실제 당첨금은 등위와 공동당첨자 수에 영향받음. 이 보고서는 금전 기대수익 개선을 주장하지 않음.','28게임짜리8개 후보 완전휠링은5게임과 비용이 다르므로 동일비용 우월 사례로 표시하면 안 됨.','선택한 후보풀 안에 당첨번호가 들어온다는 조건부 보장은 실제 무조건 확률을 대체하지 않음.']}
(OUT/'lotto-portfolio-probability-facts-20260913.json').write_text(json.dumps(facts,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
fmt=lambda p:f'{100*p:.8f}%'
md=[]
md.append('# 같은 게임 수에서 실제로 개선할 수 있는 로또 확률\n')
md.append('결론: 공정한 추첨에서 번호의 미래 출현을 예측하지 않아도, 여러 게임의 당첨 영역 겹침을 줄여 **적어도 한 게임 당첨될 확률**은 개선할 수 있다. 1등 확률은 서로 다른 m게임이면 언제나 m/8,145,060이다. **5게임의 극적인 확률 상승은 수학적 상한 때문에 불가능하다.**\n')
md.append('본번호 3개 이상은 5등 이상, 4개 이상은 4등 이상, 5개 이상은 2등을 포함한 3등 이상이다. 한 게임 가격은 1,000원이며, 보너스번호는 본번호5개가 맞았을 때2·3등을 구분한다. [동행복권 공식 규칙](https://m.dhlottery.co.kr/lt645/intro)\n')
md.append('## 동일한 5게임 비교\n\n| 방식 | 5등 이상 | 4등 이상 | 3등 이상 | 1등 |\n|---|---:|---:|---:|---:|')
for r in comparisons:
 if r['m']==5:md.append('| '+r['labelKo']+' | '+' | '.join(fmt(r['probability'][k]) for k in K)+' |')
md.append('\n8개 후보 부분휠링은 {1,…,8}에서 제외쌍(1,2),(3,4),(5,6),(7,8),(1,3)을 각각 뺀5조합이다. 다른5개 부분휠링은 확률이 달라질 수 있다. 공통고정번호 예시는 고정번호 외의 번호끼리는 서로 겹치지 않도록 구성했다. 무작위 행은 모든 서로 다른5게임 묶음의 정확한 평균이다.\n')
h=facts['fiveGameHeadroom'];md.append(f'완전 분산5게임은 무작위 평균보다5등 이상 확률이 **+{h["disjointGainVsRandomPercentagePoints"]:.8f}%p**, 상대적으로 **{100*h["relativeDisjointGainVsRandom"]:.4f}%** 높다. 보통 합집합 상한은 **{fmt(h["unionBound3"])}**, 분산5게임과의 차이는 **{h["unionBoundHeadroomAboveDisjointPercentagePoints"]:.8f}%p**뿐이다. 두 티켓의 최소 중복당첨 영역까지 반영한 더 강한 보편 상한은 **{fmt(h["elementaryStrongerUpper3"])}**, 남은 차이는 **{h["strongerBoundHeadroomAboveDisjointPercentagePoints"]:.8f}%p**다. 이 상한이 달성 가능하다는 뜻은 아니며, 분산5게임의 전역 최적성도 여기서는 증명하지 않는다.\n')
md.append('## 증명 가능한 최적성과 구성\n')
md.append('한 티켓의 유리한 추첨 결과 수는 K₃=194,130, K₄=11,350, K₅=235, K₆=1이다. 전체 결과는 N=C(45,6)=8,145,060이며, Kₖ=Σⱼ₌ₖ⁶C(6,j)C(39,6−j)로 센다. 합집합 확률은 mKₖ/N을 넘을 수 없다. [포함배제 원리 강의자료](https://people.math.sc.edu/laszlo/indicator1.pdf)\n')
md.append('어떤 두 티켓도 공통번호가1개 이하면 두 티켓이 동시에 본번호4개씩 맞으려면4+4−1=7개 이상의 추첨번호가 필요하다. 실제 본번호는6개뿐이므로 동시당첨이 불가능하다. 따라서 **4등 이상·3등 이상·1등에 대해 mKₖ/N의 전역 상한을 정확히 달성한다.** 3등 이상만 목표라면 공통번호3개 이하로도 충분하고, 1등은 서로 다른 티켓이면 모두 상한에 도달한다. 이 최적성은5등 이상에는 그대로 적용되지 않는다.\n')
md.append('42개 점을(x,y), x=0,…,5, y=0,…,6으로 놓고 번호7x+y+1에 대응시킨다. a,b=0,…,6마다 y=ax+b(mod7)를 만족하는6개 점을 티켓으로 만들면49개 티켓이 생긴다. 같은a의 서로 다른b는 겹치지 않고, 다른a끼리는 유한체 방정식에서 교점이 최대1개다. 따라서 처음1~20개를 취하면 필요한 설계를 항상 만들 수 있다. 완전 분산은7게임까지만 가능하다(7×6=42). 실제 사용 시45개 번호를 임의 순열로 재배치해3개 누락번호를 바꿀 수 있으며, 확률은 그대로다. 이는 [유한 아핀 평면](https://math.libretexts.org/Bookshelves/Combinatorics_and_Discrete_Mathematics/Combinatorics_(Morris)/04:_Design_Theory/18:_More_Designs/18.03:_Affine_Planes)의 교점 성질을 이용해 직접 구성한 예다.\n')
md.append('## 5등 이상 확률의 정확한 계산\n')
md.append('완전 분산 m≤7게임에서 두 티켓이 동시에3개 이상 맞는 결과는 각각3개씩 뽑는 C(6,3)²=400개다. 세 티켓의 동시당첨은9개 번호가 필요해 불가능하다. 따라서 정확한 확률은 [mK₃−400C(m,2)]/N이다.\n')
md.append('일반적인 공통번호 최대1개 설계도 완전 열거 없이 정확히 계산할 수 있다. n₀,n₁을 각각 공통번호0개/1개인 티켓쌍 수, T를 세 쌍의 교점이 모두 존재하고 서로 다른3개 번호인 티켓삼중항 수, Q를 여섯 쌍의 교점이 모두 존재하고 서로 다른6개 번호인 티켓사중항 수로 놓으면, 정확한 결과 수는 **mK₃−400n₀−3,700n₁+64T−Q**다.\n')
md.append('교차검증: T의 삼중교집합은 세 교점과 각 티켓의 고유번호4개 중1개씩을 고르는4³=64개다. Q의 사중교집합은 여섯 교점으로 이루어진1개다. 다섯 티켓이 각각3개 이상 맞으면 티켓 내부 추첨번호쌍이최소5C(3,2)=15개인데, 서로 다른 티켓은 같은 번호쌍을 공유할 수 없어 전체6개 추첨번호의15쌍을 정확히 분할해야 한다. 각 추첨번호는 다른5개와 짝을 이뤄야 하지만3개짜리 블록은 매번2쌍을 제공하므로 불가능하다. 따라서5중 이상 항은0이다. 1~20게임 예제와 별도 K₄ 예제에서 이 식을 기존 비트집합 완전집계와 대조했다.\n')
md.append('보편적인 더 강한5등 이상 상한은 [mK₃−400(m−1)]/N이다. 모든 두 티켓은 최소400개의 당첨 결과를 공유한다(공통번호0~6개별 교집합 수:400,3700,13900,31470,60486,109770,194130). 첫 티켓 이후 추가하는 각 티켓은 이미 있는 첫 티켓과 최소400개가 겹치므로 새로운 당첨 영역은최대K₃−400개만 늘어난다.\n')
md.append('## 1~20게임의 검증 가능한 설계 예\n\n아래5등 이상은 앞의49티켓 중 a,b의 사전순 앞m개를 선택한 **특정 설계의 정확한 값**이다. 8게임 이상에서5등 이상 전역 최적이라고 주장하지 않는다. 4등 이상부터는 표시한 값이 전역 최대다.\n\n| 게임 | 무작위 평균5등 이상 | 설계5등 이상 | 설계4등 이상(최대) | 설계3등 이상(최대) | 1등 |\n|---:|---:|---:|---:|---:|---:|')
for r in by_m:md.append(f'| {r["m"]} | {fmt(r["uniformDistinctMeanProbability"][3])} | '+' | '.join(fmt(r['exampleLinearDesign']['probability'][k]) for k in K)+' |')
md.append('\n## 집중형 휠링의 조건부 보장\n')
md.append('후보풀v개에서 가능한6개 조합을 전부 사면 C(v,6)게임이다. 이때 적어도k개 맞는 티켓이 존재할 확률은 Σᵣ₌ₖ⁶C(v,r)C(45−v,6−r)/N이다. 후보풀 안에 당첨번호가k개 이상 있어야 한다는 조건이 붙는다. 7개 후보 완전휠링은7게임을 써도5등 이상3.93698757%, 8개 후보 완전휠링은28게임을 써도5.94028773%다. 후자는1~20게임 범위 밖의 구조 설명용 예시이며 동일비용 우월 사례가 아니다. 후보풀 적중 시 여러 장이 함께 당첨될 수 있지만, 당첨 영역을 넓히는 목적에는 불리하다.\n')
md.append('같은 m게임에서 평균 당첨 게임 수는 어떤 구성이나 mKₖ/N으로 같다. 분산은 당첨 게임이 한 결과에 몰리는 정도를 줄여 적어도하나 당첨되는 확률을 높인다. 금전 기대수익의 증가, 특정 번호 예측력, 1등 확률 추가 향상으로 설명하면 안 된다. 고정·제외 조건을 추가하면 최대1개 겹침 설계가 불가능할 수도 있으므로 실제 생성한 티켓으로 다시 계산해야 한다.\n')
(OUT/'LOTTO_PORTFOLIO_FINDINGS.ko.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
print(json.dumps({'facts':str(OUT/'lotto-portfolio-probability-facts-20260913.json'),'findings':str(OUT/'LOTTO_PORTFOLIO_FINDINGS.ko.md'),'fiveGameHeadroom':h,'m20':by_m[-1]},ensure_ascii=True,indent=2))
