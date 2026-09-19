'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const T=require('../data/jackpot-research/type-partitions.cjs');
const M=require('../data/jackpot-research/type-models.cjs');
const E=require('../data/jackpot-research/exact-type-cardinalities.json');
const R=require('../data/jackpot-research/jackpot-type-report.json');
const A=require('../data/jackpot-research/audit/final-report-audit.json');
const independent=require('../data/jackpot-research/audit/independent-scoring-reconstruction.json');
const {draws}=require('../data/draws.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
function close(a,b,tol=1e-12){assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol,`${a} != ${b}`);}
function choose(n,k){if(k<0||k>n)return 0;let v=1;for(let i=1;i<=k;i++)v=v*(n-i+1)/i;return Math.round(v);}

test('1등 연구가 공식 원본·명세·독립 감사에서 검증한 정확한 파일을 사용',()=>{
 const provenance=require('../data/jackpot-provenance.json');
 for(const f of provenance.files)assert.equal(hash(f.path),f.sha256,f.path);
 assert.equal(hash('data/jackpot-research/jackpot-type-report.json'),A.sourceSha256);
 assert.equal(hash('data/draws.json'),R.metadata.dataSha256);
 assert.equal(A.passed,true);assert.equal(R.metadata.firstPrizeWinnerCountsUsedAsWeights,false);
 assert.equal(R.metadata.freshHoldout,false);assert.equal(R.metadata.everyDrawWeight,1);
 for(const [f,h] of Object.entries(R.metadata.codeSha256))assert.equal(hash('data/jackpot-research/'+f),h);
});

test('814만여 조합 전수 기수와 홀짝·소수·연속쌍·범위의 별도 수식이 일치',()=>{
 const actual=T.enumerateCardinalities();assert.deepEqual(actual.partitions,E.partitions);assert.equal(actual.total,choose(45,6));
 const get=id=>E.partitions.find(p=>p.id===id).categories;
 for(const [id,successes] of [['odd_count',23],['low_count',22],['prime_count',14]])
   get(id).forEach((c,k)=>assert.equal(c.cardinality,choose(successes,k)*choose(45-successes,6-k)));
 // Six picked numbers with r runs have 6-r adjacent pairs. Runs and intervening gaps count independently.
 get('adjacent_pairs').forEach((c,adj)=>assert.equal(c.cardinality,choose(5,5-adj)*choose(40,6-adj)));
 get('span_bin').forEach((c,i)=>{
   const [lo,hi]=T.SPAN_BINS[i];let n=0;
   for(let span=Math.max(5,lo);span<=hi;span++)n+=(45-span)*choose(span-1,4);
   assert.equal(c.cardinality,n);
 });
});

test('공식 522회 분류·횟수·실제 사례는 원본 본번호와 일치하고 보너스를 포함하지 않음',()=>{
 const counts=T.PARTITIONS.map(p=>Array(p.categories.length).fill(0));
 draws.forEach((d,i)=>{
   const f=T.classify(d.numbers),r=R.perDrawFeatures[i];
   assert.equal(r.round,d.round);assert.deepEqual(r.numbers,d.numbers);assert.deepEqual(r.indices,f.indices);
   f.indices.forEach((j,p)=>counts[p][j]++);
 });
 R.descriptive.partitions.forEach((p,i)=>p.categories.forEach((c,j)=>{
   assert.equal(c.observedDrawCount,counts[i][j]);
   close(c.theoreticalProbability,c.cardinality/T.TOTAL);
   if(!c.possible){assert.equal(c.cardinality,0);assert.equal(c.observedRateWilson95,null);}
   for(const e of c.knownDrawExamples){const d=draws.find(d=>d.round===e.round);assert.deepEqual(e.numbers,d.numbers);assert.equal(T.classify(e.numbers).indices[i],j);}
 }));
});

test('빈 자료·실제 자료·극단 자료에서 10개 유형 분포와 혼합의 확률 총합 보존',()=>{
 const cases=[[],draws.slice(-156),Array.from({length:156},(_,i)=>({round:i,numbers:[1,2,3,4,5,6]}))];
 for(const history of cases){
   const fit=M.fitTypeModels(history);
   T.PARTITIONS.forEach((p,i)=>{
     let ticketMass=0;
     E.partitions[i].categories.forEach((c,j)=>{
       const pc=fit.byPartition[p.id].categoryProbabilities[j];
       if(!c.possible)assert.equal(pc,0);
       else {assert.ok(pc>0);ticketMass+=c.cardinality*(pc/c.cardinality);}
     });
     close(ticketMass,1);
   });
   const scores=M.scoreTicket(fit,[7,13,16,23,24,43]);
   const sum=M.IDS.slice(0,-1).reduce((s,id)=>s+scores[id].experimentalTicketProbability,0);
   close(scores.type_mixture.experimentalTicketProbability,sum/11,1e-20);
   if(!history.length)for(const id of M.IDS)close(scores[id].experimentalTicketProbability,1/T.TOTAL,1e-20);
 }
});

test('366회 예측은 오직 직전 156회로 재현되고 실제 6개 조합의 4392개 점수가 일치',()=>{
 assert.equal(R.perRoundScores.length,366);
 const aliases={uniform:'uniform',odd_count:'odd',low_count:'low22',sum_bin:'sum',adjacent_pairs:'adjacent',last_digit_distinct:'lastDigitDistinct',prime_count:'prime',decade_occupancy:'decade',span_bin:'span',joint_sum_odd_adjacent:'sumOddAdjacent',joint_sum_odd_low:'sumOddLow',type_mixture:'equalMixture'};
 for(const row of R.perRoundScores){
   const t=draws.findIndex(d=>d.round===row.round);
   assert.equal(row.trainingFirstIndex,t-156);assert.equal(row.trainingLastIndex,t-1);
   assert.equal(row.trainingLastRound,row.round-1);
   const fitted=M.fitTypeModels(draws.slice(0,t)),actual=M.scoreTicket(fitted,draws[t].numbers);
   const separate=independent.allRecords.find(r=>r.round===row.round);assert.ok(separate);
   for(const id of M.IDS){
     close(actual[id].jointLogGain,row.models[id].jointLogGain);
     close(actual[id].experimentalTicketProbability,row.models[id].experimentalTicketProbability,1e-20);
     close(Math.log(T.TOTAL*actual[id].experimentalTicketProbability),actual[id].jointLogGain);
     close(actual[id].jointLogGain,separate.logRelativeLikelihoodByModel[aliases[id]]);
     close(actual[id].experimentalTicketProbability,separate.experimentalProbabilityByModel[aliases[id]],1e-20);
   }
 }
});

test('번호 순서·당첨자 수와 학습창 밖 자료에 영향받지 않고 잘못된 여섯 번호 거부',()=>{
 const history=structuredClone(draws),fit=M.fitTypeModels(history.slice(0,300));
 history.forEach((d,i)=>{
   d.firstPrizeWinners=999999;
   if(i<144||i>=300)d.numbers=[40,41,42,43,44,45];
 });
 assert.deepEqual(M.fitTypeModels(history.slice(0,300)),fit);
 const numbers=[43,24,23,16,13,7],before=numbers.slice();
 assert.deepEqual(M.scoreTicket(fit,numbers),M.scoreTicket(fit,before.slice().sort((a,b)=>a-b)));
 assert.deepEqual(numbers,before);
 for(const invalid of [[1,2,3,4,5],[1,2,3,4,5,5],[0,2,3,4,5,6],[1,2,3,4,5,46],[1,2,3,4,5,,]])assert.throws(()=>T.classify(invalid));
});

test('모형 선택은 개발 262회로 재현되며 마지막 104회의 모든 대안을 공개',()=>{
 assert.equal(R.validation.models.length,12);
 const means={};
 for(const id of R.validation.models){
   for(const [stage,key,n] of [['development','development',262],['reusedHistoricalTest','reusedHistoricalTest',104]]){
     const rows=R.perRoundScores.filter(r=>r.stage===stage);assert.equal(rows.length,n);
     const avg=rows.reduce((s,r)=>s+r.models[id].jointLogGain,0)/n;
     close(avg,R.validation.summary[key][id].meanJointLogGain);
     if(stage==='development')means[id]=avg;
   }
 }
 const best=R.validation.models.reduce((a,b)=>means[b]>means[a]?b:a);
 assert.equal(best,R.validation.selection.selectedModel);
 assert.equal(R.validation.splits.reusedHistoricalTest.freshHoldout,false);
 assert.deepEqual(R.validation.models.filter(id=>id!=='uniform'&&R.validation.summary.reusedHistoricalTest[id].jointLogGainIntervalAdjusted.lower>0),[]);
});

test('1242회 최신 유형 추정과 단일·5조합 확률은 정확한 분모와 일치',()=>{
 const fit=M.fitTypeModels(draws);
 for(const p of E.partitions){
   const f=R.latestForecast.byPartition[p.id];
   f.categories.forEach((c,i)=>{
     close(c.modeledCategoryProbability,fit.byPartition[p.id].categoryProbabilities[i]);
     if(!c.possible){assert.equal(c.modeledCategoryProbability,0);assert.equal(c.observedRateWilson95,null);return;}
     const probability=c.modeledCategoryProbability/c.categoryCardinality;
     close(c.experimentalTicketProbability,probability,1e-20);
     close(c.fairTicketProbability,1/T.TOTAL,1e-20);
     if(c.categoryCardinality>=5){
       close(c.fiveDistinctTicketsSameCategory.experimentalModelProbability,5*probability,1e-20);
       close((c.categoryCardinality/T.TOTAL)*(5/c.categoryCardinality),5/T.TOTAL,1e-20);
     }else assert.equal(c.fiveDistinctTicketsSameCategory,null);
     assert.equal(c.modelProbabilityIsVerifiedFutureChance,false);
   });
 }
});
