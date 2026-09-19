'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const C=require('../dist/core.js'),J=require('../dist/joint.js'),LM=require('../data/lag-research/lag-models.cjs');
const {draws}=require('../data/draws.json'),S=require('../data/lag-associations.json'),L=require('../data/lag-models.json');
const close=(a,b,t=1e-11)=>assert(Math.abs(a-b)<=t,`${a} != ${b}`);
test('회차 간 연구 산출물·자료·실험 원래 코드의 해시 일치',()=>{
  const provenance=require('../data/lag-provenance.json'),root=path.resolve(__dirname,'..');
  const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
  assert.equal(digest('data/draws.json'),L.metadata.dataSha256);assert.equal(L.metadata.dataSha256,S.source.dataSha256);assert.equal(L.metadata.dataSha256,provenance.dataSha256);
  for(const f of provenance.files)assert.equal(digest(f.path),f.sha256,f.path);
  for(const [file,hash] of Object.entries(L.metadata.codeSha256))assert.equal(digest('data/lag-research/'+file),hash,file);
  assert.equal(digest('dist/joint.js'),require('../data/lag-research/joint-independent-audit.json').sha256);
});
test('558900개 검색 보정 p, 화면 규칙 분자·분모와 시차 중복 독립 재계산',()=>{
  const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../data/lag-research/lag-associations-all-counts.json.gz'))));
  assert.equal(S.method.ruleCount,12*(45*45+990*45));assert.equal(raw.records.length,12);
  const maxes=raw.permutationMaxAbsoluteResidualSingleAndPair.map(r=>Math.max(...r));assert.equal(maxes.length,999);
  const rules=[...S.topPositiveRules,...S.topNegativeRules,...S.topSinglePositiveRules,...S.topRulesByLag.flatMap(r=>['singlePositive','singleNegative','pairPositive','pairNegative'].flatMap(k=>r[k]))];
  for(const r of rules){
    const indices=draws.slice(0,-r.lag).map((d,i)=>r.antecedent.every(n=>d.numbers.includes(n))?i:-1).filter(i=>i>=0);
    assert.equal(indices.length,r.support);assert.equal(indices.filter(i=>draws[i+r.lag].numbers.includes(r.target)).length,r.hits);
    close(r.conditionalRate,r.hits/r.support);close(r.backgroundRate,draws.slice(r.lag).filter(d=>d.numbers.includes(r.target)).length/(draws.length-r.lag));
    close(r.familywisePermutationP,(1+maxes.filter(v=>v>=Math.abs(r.standardizedResidual)-1e-12).length)/1000);
  }
  for(const r of S.lagOverlap){const count=draws.slice(r.lag).reduce((a,d,i)=>a+d.numbers.filter(n=>draws[i].numbers.includes(n)).length,0);close(r.meanSharedNumbers,count/(draws.length-r.lag));}
  assert.equal(new Set(draws.map(d=>C.key(d.numbers))).size,522);
});
test('시간 순서를 지킨 시차 모형의 전체366회 ×7개 점수 재계산',()=>{
  assert.equal(L.perRound.length,366);assert.equal(L.metadata.freshHoldout,false);assert.equal(L.selection.selectedModel,'uniform');
  for(const row of L.perRound){
    const history=draws.slice(0,row.index),components=[];
    assert.equal(history.length,row.historyDrawCount);assert.equal(draws[row.index].round,row.round);
    for(const model of LM.MODELS){
      const fit=LM.fitLagWeights(history,model.id),space=J.componentSpace(fit.weights),p=space.marginals();
      for(const lag of fit.diagnostics.lags||[]){if(lag.available){assert(lag.trainingMaxTargetIndex<row.index);assert.equal(lag.sourceIndex,row.index-lag.lag);}}
      close(space.logProbability(row.actual)+Math.log(C.TOTAL),row.models[model.id].jointLogGain);
      close(p.reduce((s,x,i)=>s+(x-(row.actual.includes(i+1)?1:0))**2,0)/45,row.models[model.id].brier);
      components.push({id:model.id,probability:1/6,weights:fit.weights});
    }
    const mixture=J.mixtureSpace(components);
    close(mixture.logProbability(row.actual)+Math.log(C.TOTAL),row.models.lag_mixture.jointLogGain);
    close(mixture.marginals().reduce((s,x,i)=>s+(x-(row.actual.includes(i+1)?1:0))**2,0)/45,row.models.lag_mixture.brier);
  }
});
test('내장된 다음 회차 분포와 재학습 분포 일치, 혼합의 정확한 확률',()=>{
  for(const model of LM.MODELS){
    const actual=LM.fitLagWeights(draws,model.id),f=L.nextForecast[model.id];
    actual.weights.forEach((w,i)=>close(w,f.weights[i]));
    J.componentSpace(f.weights).marginals().forEach((p,i)=>close(p,f.marginals[i]));
  }
  const f=L.nextForecast.lag_mixture,space=J.mixtureSpace(f.components);
  space.marginals().forEach((p,i)=>close(p,f.marginals[i]));
  for(const ticket of [draws[0].numbers,draws.at(-1).numbers,[1,2,3,4,5,6]]){
    const mass=f.components.reduce((s,c)=>s+Math.exp(J.componentSpace(c.weights).logProbability(ticket))/6,0);
    close(Math.exp(space.logProbability(ticket)),mass,1e-18);
  }
  for(const m of L.modelDefinitions.filter(m=>m.id!=='uniform')){
    const result=L.summary.reusedHistoricalTest[m.id],ci=result.jointLogGainIntervalAdjusted;
    assert(result.meanJointLogGain<0);assert(ci.lower<=0&&ci.upper>=0);
  }
});
