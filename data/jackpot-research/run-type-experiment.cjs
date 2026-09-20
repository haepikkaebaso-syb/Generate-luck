'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const T=require('./type-partitions.cjs'),M=require('./type-models.cjs'),E=require('./exact-type-cardinalities.json');
const DATA=String.raw`D:\로또 당첨번호 발생기\data\draws.json`,OUT=__dirname;
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function read(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function mean(a){return a.reduce((s,x)=>s+x,0)/a.length;}
function wilson(count,n){const z=1.959963984540054,p=count/n,den=1+z*z/n,center=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return {confidence:.95,lower:Math.max(0,center-half),upper:Math.min(1,center+half),width:2*half,method:'Wilson observed-rate interval; descriptive, unadjusted, not a future prediction interval'};}
function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function quantile(a,p){const v=(a.length-1)*p,i=Math.floor(v);return a[i]+(a[Math.min(a.length-1,i+1)]-a[i])*(v-i);}
function summarize(rows,seed){
 const ids=M.IDS,n=rows.length,B=4000,block=4,confidence=1-.05/11,rng=random(seed),samples=Object.fromEntries(ids.map(id=>[id,[]]));
 for(let b=0;b<B;b++){
  const sums=Object.fromEntries(ids.map(id=>[id,0]));let used=0;
  while(used<n){const start=Math.floor(rng()*n);for(let j=0;j<block&&used<n;j++,used++){const row=rows[(start+j)%n];for(const id of ids)sums[id]+=row.models[id].jointLogGain;}}
  for(const id of ids)samples[id].push(sums[id]/n);
 }
 const out={};for(const id of ids){
  samples[id].sort((a,b)=>a-b);const logGains=rows.map(r=>r.models[id].jointLogGain),avg=mean(logGains),alpha=(1-confidence)/2;
  const interval=level=>({confidence:level,lower:quantile(samples[id],(1-level)/2),upper:quantile(samples[id],1-(1-level)/2),method:'paired circular-block percentile bootstrap',blockLength:block,replicates:B,seed});
  out[id]={drawCount:n,meanJointLogGain:avg,sumJointLogGain:logGains.reduce((s,x)=>s+x,0),geometricMeanAssignedLikelihoodRatio:Math.exp(avg),jointLogGainIntervalAdjusted:interval(confidence),jointLogGainInterval95:interval(.95)};
 }
 return out;
}
function main(){
 const spec=read(path.join(OUT,'specification.json')),input=read(DATA),draws=input.draws;if(draws.length!==522)throw new Error('Expected522draws');
 const perDrawFeatures=draws.map((d,index)=>({index,round:d.round,date:d.date,numbers:d.numbers.slice(),weight:1,...T.classify(d.numbers)}));
 const observed=T.PARTITIONS.map(p=>Array(p.categories.length).fill(0)),examples=T.PARTITIONS.map(p=>p.categories.map(()=>[]));
 perDrawFeatures.forEach(d=>d.indices.forEach((c,i)=>{observed[i][c]++;examples[i][c].push({round:d.round,date:d.date,numbers:d.numbers});}));
 const descriptivePartitions=E.partitions.map((p,i)=>{
  const categories=p.categories.map((c,j)=>{
   const count=observed[i][j],rate=count/draws.length;if(!c.cardinality&&count)throw new Error('Impossible observed category');
   return {...c,observedDrawCount:count,totalObservedDraws:draws.length,observedRate:rate,expectedDrawCount:draws.length*c.theoreticalProbability,lift:c.possible?rate/c.theoreticalProbability:null,observedRateWilson95:c.possible?wilson(count,draws.length):null,structuralZeroNote:c.possible?null:'No unordered six-number combination belongs to this category; exact probability is0.',knownDrawExamples:examples[i][j].slice(-3).reverse()};
  });
  const topCommon=categories.filter(c=>c.possible).slice().sort((a,b)=>b.observedDrawCount-a.observedDrawCount||a.index-b.index).slice(0,5);
  const topPerCombinationLift=categories.filter(c=>c.possible&&c.observedDrawCount>=20).slice().sort((a,b)=>b.lift-a.lift||b.observedDrawCount-a.observedDrawCount||a.index-b.index).slice(0,5);
  return {...p,categories,topCommon,topPerCombinationLift,minimumCountForLiftDisplay:20};
 });
 const perRoundScores=[];
 for(let t=156;t<draws.length;t++){
  const fitted=M.fitTypeModels(draws.slice(0,t));
  if(fitted.historyLastRound!==draws[t-1].round||fitted.historyFirstRound!==draws[t-156].round)throw new Error('Training window audit failed');
  perRoundScores.push({index:t,round:draws[t].round,date:draws[t].date,numbers:draws[t].numbers,stage:t<418?'development':'reusedHistoricalTest',trainingFirstIndex:t-156,trainingLastIndex:t-1,trainingFirstRound:fitted.historyFirstRound,trainingLastRound:fitted.historyLastRound,trainingDrawCount:fitted.trainingDrawCount,models:M.scoreTicket(fitted,draws[t].numbers)});
 }
 const dev=perRoundScores.filter(r=>r.stage==='development'),test=perRoundScores.filter(r=>r.stage==='reusedHistoricalTest');
 const development=summarize(dev,20260913),reusedHistoricalTest=summarize(test,20260914);
 let selected='uniform';for(const id of M.IDS)if(development[id].meanJointLogGain>development[selected].meanJointLogGain)selected=id;
 const latestFit=M.fitTypeModels(draws),byPartition={};
 for(const p of E.partitions){
  const fit=latestFit.byPartition[p.id];
  byPartition[p.id]={id:p.id,label:p.label,trainingDrawCount:latestFit.trainingDrawCount,priorStrength:156,categories:p.categories.map((c,j)=>{
   const pc=fit.categoryProbabilities[j],count=fit.historyCounts[j],observedRate=count/latestFit.trainingDrawCount;
   return {index:c.index,key:c.key,label:c.label,possible:c.possible,categoryCardinality:c.cardinality,trailingObservedCount:count,trailingObservedRate:observedRate,observedRateWilson95:c.possible?wilson(count,latestFit.trainingDrawCount):null,structuralZeroNote:c.possible?null:'No unordered six-number combination belongs to this category; exact probability is0.',theoreticalCategoryProbability:c.theoreticalProbability,modeledCategoryProbability:pc,fairTicketProbability:1/T.TOTAL,experimentalTicketProbability:c.possible?pc/c.cardinality:null,experimentalPerTicketLiftOverFair:c.possible?pc/c.theoreticalProbability:null,fiveDistinctTicketsSameCategory:c.cardinality>=5?{ticketCount:5,fairProbability:5/T.TOTAL,experimentalModelProbability:5*pc/c.cardinality,assumption:'All5distinct tickets lie in this category; exact under this fitted category model only.'}:null,modelProbabilityIsVerifiedFutureChance:false};
  })};
 }
 const latestForecast={context:{predictionAfterRound:draws.at(-1).round,nextRoundLabel:draws.at(-1).round+1,asOfDate:'2026-09-13',trainingFirstRound:latestFit.historyFirstRound,trainingLastRound:latestFit.historyLastRound,trainingDrawCount:156,priorStrength:156,selectedHistoricalModel:selected},byPartition,uniform:{ticketProbability:1/T.TOTAL},mixture:{id:'type_mixture',distribution:'equal mixture of11normalized ticket distributions',components:M.IDS.slice(0,-1).map(id=>({id,probability:1/11})),ticketProbabilityEvaluator:'type-models.cjs scoreTicket(fitTypeModels(history),numbers).type_mixture',note:'Each component uses its own partition. Do not average unrelated category probabilities or lifts to infer a ticket probability.'},examples:{sum120to149:byPartition.sum_bin.categories.find(c=>c.key==='120-149')},interpretation:'Modeled category and per-ticket probabilities are experimental estimates, not verified future lottery chances. Under a fair independent draw category probability is exactly Nc/N and ticket probability is1/N.'};
 const report={
  metadata:{title:'Historical jackpot six-number types and per-combination probability exploration',createdAtUtc:new Date().toISOString(),referenceDate:'2026-09-13',drawCount:522,source:input.metadata,everyDrawWeight:1,firstPrizeWinnerCountsUsedAsWeights:false,exactSampleSpaceSize:T.TOTAL,freshHoldout:false,exploratory:true,specificationFixedBeforeScores:true,dataSha256:sha(DATA),codeSha256:Object.fromEntries(['type-partitions.cjs','enumerate-types.cjs','type-models.cjs','verify-type-models.cjs','run-type-experiment.cjs','specification.json'].map(f=>[f,sha(path.join(OUT,f))])),cardinalityFileSha256:sha(path.join(OUT,'exact-type-cardinalities.json'))},
  specification:spec,classification:{definitions:T.PARTITIONS,exactCardinalitiesFile:'exact-type-cardinalities.json',eachPartitionTotal:T.TOTAL,impossibleCategoriesRetained:true},
  descriptive:{method:'Each draw once. Historical count and rate, exact fair expectation, observed/fair lift, unadjusted Wilson95 observed-rate interval.',partitions:descriptivePartitions},
  validation:{models:M.IDS,splits:{warmup:{count:156,firstRound:draws[0].round,lastRound:draws[155].round},development:{count:262,firstRound:dev[0].round,lastRound:dev.at(-1).round},reusedHistoricalTest:{count:104,firstRound:test[0].round,lastRound:test.at(-1).round,freshHoldout:false}},primaryMetric:'log(N*P(actual unordered six-number ticket)); natural-log nats/draw; uniform baseline0',selection:{criterion:'highest development meanJointLogGain including uniform',selectedModel:selected,developmentMeanJointLogGain:development[selected].meanJointLogGain,reusedHistoricalTestMeanJointLogGain:reusedHistoricalTest[selected].meanJointLogGain,selectedTestInterval95:reusedHistoricalTest[selected].jointLogGainInterval95},summary:{development,reusedHistoricalTest},uncertainty:{method:'circular block bootstrap4000 replicates,block4,paired model indices',alternativeCount:11,individualAdjustedConfidence:1-.05/11,familywiseAlphaApproximate:.05,selected95IntervalPostSelectionAdjusted:false,freshHoldout:false}},
  latestForecast,perDrawFeatures,perRoundScores,
  verification:{syntheticChecksPassed:7,allPartitionTotalsVerified:true,allPredictionTrainingWindowsAudited:true,firstPrizeWinnerWeightIgnoredTestPassed:true},
  limitations:spec.limitations
 };
 fs.writeFileSync(path.join(OUT,'jackpot-type-report.json'),JSON.stringify(report,null,2)+'\n');
 const pct=x=>(x*100).toFixed(4)+'%',s=latestForecast.examples.sum120to149;
 const scoreTable=M.IDS.map(id=>{const d=development[id],v=reusedHistoricalTest[id],ci=v.jointLogGainIntervalAdjusted;return `| ${id} | ${d.meanJointLogGain.toFixed(6)} | ${v.meanJointLogGain.toFixed(6)} | ${ci.lower.toFixed(6)} ~ ${ci.upper.toFixed(6)} |`;}).join('\n');
 const commonTable=descriptivePartitions.map(p=>{const c=p.topCommon[0];return `| ${p.label} | ${c.label} | ${c.observedDrawCount}/522 | ${pct(c.observedRate)} | ${pct(c.theoreticalProbability)} | ${c.cardinality.toLocaleString('en-US')} |`;}).join('\n');
 const alternatives=M.IDS.filter(id=>id!=='uniform'),positiveTest=alternatives.filter(id=>reusedHistoricalTest[id].meanJointLogGain>0),adjustedAboveZero=alternatives.filter(id=>reusedHistoricalTest[id].jointLogGainIntervalAdjusted.lower>0);
 const md=`# 로또 1등 여섯 번호의 유형 분석\n\n공식720~1241회 522회에서 각 회차의 주번호 여섯 개를 한 번씩 분석했습니다. 1등 당첨자 수로 여러 번 세지 않았습니다. 가능한8,145,060개 조합을 직접 전수 분류해 유형 크기 Nc를 계산했습니다.\n\n## 가장 자주 관측된 유형\n\n| 분류 | 가장 흔한 유형 | 관측 횟수 | 관측 비율 | 공정 추첨의 정확한 유형 확률 | 그 유형의 조합 수 Nc |\n|---|---|---:|---:|---:|---:|\n${commonTable}\n\n유형 전체가 자주 나오는 이유에는 그 유형에 속하는 조합이 많은 점이 포함됩니다. 한 유형의 과거 비율이나 미래 모형 확률 pc를 티켓 한 개의 확률로 읽으면 안 됩니다. 해당 유형 안의 조합에 같은 확률을 주는 모형에서는 개별 조합 확률이 pc/Nc입니다. 공정하고 독립적인 추첨에서는 유형 확률이 Nc/8,145,060이므로 모든 개별 조합 확률은똑같이1/8,145,060입니다.\n\n## 고정된 예측 실험\n\n10개 유형 모형과 균등 기준, 11개 정규화 조합분포의 동일 비중 혼합을 평가했습니다. 각 예측은 직전156회만 사용하고, 공정 추첨 유형 확률에156회분의 사전 가중치를 더했습니다. 처음156회는 준비, 다음262회는 선택, 마지막104회는 이미 다른 실험에서 본 재사용 과거검증입니다. 정의와 유형 구간은 이 실험 점수를 계산하기 전에 고정했습니다.\n\n| 모형 | 개발 평균 공동 로그차 | 재사용104회 평균 공동 로그차 | 재사용 검증99.5455% 구간 |\n|---|---:|---:|---|\n${scoreTable}\n\n개발 선택은 **${selected}**입니다. 마지막104회 평균 로그차가 양수인 대안은 ${positiveTest.length}개, 11개 비교를 근사 보정한 구간의 하한이0보다 큰 대안은 ${adjustedAboveZero.length}개입니다. 이 구간은 새 독립검증이 아니므로 유망한 미래 당첨번호나 개별 티켓 확률 개선이 입증됐다고 해석하지 않습니다.\n\n## 다음 유형을 가늠하는 구체적 예\n\n합계120~149 유형에는 정확히${s.categoryCardinality.toLocaleString('en-US')}개 조합이 들어갑니다. 공정 추첨의 유형 확률은${pct(s.theoreticalCategoryProbability)}입니다. 최근156회 관측은${s.trailingObservedCount}회(${pct(s.trailingObservedRate)})이며, 사전156회를 섞은 유형 모형 추정은${pct(s.modeledCategoryProbability)}입니다.\n\n이 모형의 해당 유형 개별 조합 추정은${s.experimentalTicketProbability.toExponential(9)}, 공정 추첨 개별 조합 확률은${s.fairTicketProbability.toExponential(9)}입니다. 이 유형의 서로 다른5개 티켓을 고르면 같은 모형에서는5·pc/Nc=${s.fiveDistinctTicketsSameCategory.experimentalModelProbability.toExponential(9)}, 공정 추첨에서는5/8,145,060=${s.fiveDistinctTicketsSameCategory.fairProbability.toExponential(9)}입니다. 이 수치는 모형 계산의 예이며 실제 미래 확률이 바뀌었다는 보장이 아닙니다.\n\n## 읽을 때의 기준\n\n- 모든 유형에 관측 횟수, 이론 기대값, lift, Wilson95 관측비율 구간과 폭을 제공했습니다. 이 구간은 탐색적 기술통계이며 미래 예측구간이 아닙니다.\n- 자주 나온 유형과 조합 한 개당 관측밀도가 높은 유형을 별도로 제공합니다. 후자는 사전 지정한 최소 관측20회를 표시 기준으로 사용했으며 학습조건을 바꾸는 데 사용하지 않았습니다.\n- 각 표시 유형에는 실제 회차·날짜·여섯 번호 예시3개가 있습니다.\n- 비교 구간은 원형4회 블록을4,000번 재표집한 근사 구간입니다. 선택모형95% 구간은 선택과 자료 재사용을 보정하지 않습니다.\n- 전체JSON은 jackpot-type-report.json, 전수 기수는 exact-type-cardinalities.json, 재현은 enumerate-types.cjs와 run-type-experiment.cjs입니다.\n`;
 fs.writeFileSync(path.join(OUT,'FINDINGS.ko.md'),md);
 console.log(JSON.stringify({selectedModel:selected,development:Object.fromEntries(M.IDS.map(id=>[id,development[id].meanJointLogGain])),reusedHistoricalTest:Object.fromEntries(M.IDS.map(id=>[id,{mean:reusedHistoricalTest[id].meanJointLogGain,adjustedCI:reusedHistoricalTest[id].jointLogGainIntervalAdjusted}])),sum120to149:s,report:path.join(OUT,'jackpot-type-report.json')},null,2));
}
module.exports={wilson,summarize};if(require.main===module)main();
