'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../dist/core.js'),R=require('../dist/research.js');
const close=(actual,expected,tolerance=1e-12)=>assert(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
test('겹친 번호 수별 정확한 당첨 영역: 독립 상태 DP 기준값',()=>{
  const expected=[387860,384560,374360,356790,327774,278490,194130],a=[1,2,3,4,5,6];
  for(let overlap=0;overlap<=6;overlap++){
    const b=[...a.slice(0,overlap),...Array.from({length:6-overlap},(_,i)=>i+7)];
    assert.equal(R.coverageExact([a,b]).favorable,expected[overlap]);
  }
});
test('비중복 5게임의 실제 개선 크기 및 중복 티켓 처리',()=>{
  const five=Array.from({length:5},(_,i)=>Array.from({length:6},(_,j)=>i*6+j+1)),r=R.coverageExact(five);
  assert.equal(r.favorable,966650);close(r.probability,0.1186792976,1e-10);close(r.randomBaseline,0.1136235733,1e-10);
  close((r.probability-r.randomBaseline)*100,0.50557243,1e-7);close(r.jackpot,5/8145060);
  assert.equal(R.coverageExact([five[0],five[0]]).favorable,194130);assert.equal(R.coverageExact([]).favorable,0);
});
test('가중 분포의 정확한 주변 확률을 모든 조합 열거와 비교',()=>{
  const weights=Array.from({length:45},(_,i)=>1+(i%7)/3),excluded=Array.from({length:35},(_,i)=>i+11);
  for(const fixed of [[],[2],[1,2,3,4,5,6]]){
    const weighted=R.weightedSpace(weights,fixed,excluded),space=C.createSpace({fixed,excluded});
    const counts=Array(45).fill(0);let total=0;
    for(let rank=0;rank<space.total;rank++){const n=space.unrank(rank),mass=n.reduce((p,x)=>p*weights[x-1],1);total+=mass;n.forEach(x=>{counts[x-1]+=mass;});}
    const p=weighted.marginals();p.forEach((v,i)=>close(v,counts[i]/total));close(p.reduce((a,b)=>a+b,0),6);
    const rng=R.seededRandom(3);for(let i=0;i<20;i++)assert(space.rankOf(weighted.sample(rng))>=0);
  }
});
test('모형 생성과 검증은 같은 분포, 미지원 가중 조건은 명시적으로 거절',()=>{
  assert.throws(()=>R.generateWeighted(Array(45).fill(1),{minSum:21,maxSum:21},1),/고정·제외/);
  const history=require('../data/draws.json').draws;
  for(const {id} of R.MODELS){
    const weights=R.fitWeights(history,id);assert(weights.every(w=>w>0&&Number.isFinite(w)));
    const result=R.generateWeighted(weights,{fixed:[7],excluded:[45]},5,[],R.seededRandom(174));
    assert.equal(new Set(result.numbers.map(C.key)).size,5);for(const n of result.numbers){assert(n.includes(7));assert(!n.includes(45));}
  }
});
test('분산 생성의 조건과 번호 비중복 보장, 빠른 경로 회귀',()=>{
  const makeRng=seed=>{const rng=R.seededRandom(seed);return bound=>Math.floor(rng()*bound);};
  const five=R.generateDiverse({},5,[],makeRng(174)).numbers;assert.equal(new Set(five.flat()).size,30);
  for(const options of [{maxOdd:0},{maxSum:50},{fixed:[1,2],excluded:[45]}]){
    const space=C.createSpace(options),result=R.generateDiverse(options,5,[],makeRng(174));
    assert.equal(new Set(result.numbers.map(C.key)).size,5);for(const n of result.numbers)assert(space.rankOf(n)>=0);
  }
});
test('최종 검증 구간은 선택 이후, 균등 기준은 정확히 0개선',()=>{
  const v=require('../data/validation.json'),source=require('../data/draws.json');
  assert.equal(v.protocol.warmup,156);assert.equal(v.protocol.holdout,104);assert.equal(v.protocol.development,262);
  const best=[...v.models].sort((a,b)=>a.development.brier-b.development.brier)[0];assert.equal(v.selectedModel,best.id);
  for(const m of v.models){assert.equal(m.development.lastRound+1,m.holdout.firstRound);assert.equal(m.holdout.count,104);assert.equal(m.holdout.lastRound,source.draws.at(-1).round);}
  const uniform=v.models.find(m=>m.id==='uniform');assert.equal(uniform.holdout.improvement,0);assert.deepEqual(uniform.holdout.improvementCI95,[0,0]);
  assert.equal(v.selectedHoldoutSupportsAdvantage,false);
});
test('회차 전진 검증 전부를 분포 주변 확률로 독립 재계산',()=>{
  const draws=require('../data/draws.json').draws,v=require('../data/validation.json');
  for(const model of v.models){
    for(const row of v.perRound[model.id]){
      const index=draws.findIndex(d=>d.round===row.round),prior=draws.slice(0,index);
      const p=R.weightedSpace(R.fitWeights(prior,model.id)).marginals(),winning=draws[index].numbers;
      const score=p.reduce((s,prob,i)=>s+(prob-(winning.includes(i+1)?1:0))**2,0)/45;
      close(score,row.brier);
    }
  }
});
test('수집 원본 전체 해시, 데이터와 두 분석 결과의 동일 기준',()=>{
  const root=path.join(__dirname,'../data'),manifest=require('../data/source-manifest.json');
  for(const request of manifest.requests){const bytes=fs.readFileSync(path.join(root,request.file));assert.equal(bytes.length,request.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),request.sha256);}
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'draws.json'))).digest('hex');
  assert.equal(require('../data/analysis.json').independentValidation.datasetSha256,hash);assert.equal(require('../data/validation.json').data.sha256,hash);
});
