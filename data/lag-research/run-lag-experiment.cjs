'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const L=require('./lag-models.cjs');
const C45_6=8145060,LOG_BASE=Math.log(C45_6),P0=6/45;
const OUT=__dirname,DATA=String.raw`D:\로또 당첨번호 발생기\data\draws.json`;
const IDS=[...L.MODELS.map(m=>m.id),'lag_mixture'];
function exactDistribution(weights){
  if(weights.length!==45||weights.some(w=>!Number.isFinite(w)||w<=0))throw new Error('Invalid positive weights');
  const prefix=Array.from({length:46},()=>Array(7).fill(0)),suffix=Array.from({length:46},()=>Array(7).fill(0));
  prefix[0][0]=1;suffix[45][0]=1;
  for(let i=0;i<45;i++){prefix[i+1][0]=1;for(let k=1;k<=6;k++)prefix[i+1][k]=prefix[i][k]+weights[i]*prefix[i][k-1];}
  for(let i=44;i>=0;i--){suffix[i][0]=1;for(let k=1;k<=6;k++)suffix[i][k]=suffix[i+1][k]+weights[i]*suffix[i+1][k-1];}
  const z=prefix[45][6],marginals=Array(45).fill(0);
  for(let i=0;i<45;i++){let leaveOneOut=0;for(let k=0;k<=5;k++)leaveOneOut+=prefix[i][k]*suffix[i+1][5-k];marginals[i]=weights[i]*leaveOneOut/z;}
  return {z,logZ:Math.log(z),marginals};
}
function logMeanExp(values){const max=Math.max(...values);return max+Math.log(values.reduce((s,x)=>s+Math.exp(x-max),0)/values.length);}
function topSix(scores){return Array.from({length:45},(_,i)=>i+1).sort((a,b)=>scores[b-1]-scores[a-1]||a-b).slice(0,6);}
function scoreForecast(forecast,actual){
  const actualSet=new Set(actual),brier=forecast.marginals.reduce((s,p,i)=>s+(p-(actualSet.has(i+1)?1:0))**2,0)/45;
  const top6=topSix(forecast.rankingScores||forecast.marginals);
  const jointLogGain=forecast.componentLogGains?logMeanExp(forecast.componentLogGains):actual.reduce((s,n)=>s+Math.log(forecast.weights[n-1]),0)-forecast.logZ+LOG_BASE;
  return {jointLogGain,brier,top6,top6Matches:top6.filter(n=>actualSet.has(n)).length};
}
function forecastAll(history){
  const forecasts={};
  for(const model of L.MODELS){const fit=L.fitLagWeights(history,model.id);forecasts[model.id]={...fit,...exactDistribution(fit.weights),rankingScores:fit.weights};}
  const components=L.MODELS.map(m=>forecasts[m.id]);
  forecasts.lag_mixture={marginals:Array.from({length:45},(_,i)=>components.reduce((s,c)=>s+c.marginals[i],0)/components.length),distribution:'mixture',components:L.MODELS.map(m=>({id:m.id,probability:1/L.MODELS.length,weights:forecasts[m.id].weights}))};
  return forecasts;
}
function evaluate(history,actual){
  const forecasts=forecastAll(history),scores={};
  for(const m of L.MODELS)scores[m.id]=scoreForecast(forecasts[m.id],actual);
  forecasts.lag_mixture.componentLogGains=L.MODELS.map(m=>scores[m.id].jointLogGain);
  scores.lag_mixture=scoreForecast(forecasts.lag_mixture,actual);
  for(const m of L.MODELS){
    for(const d of forecasts[m.id].diagnostics.lags){if(d.trainingMaxTargetIndex!==null&&d.trainingMaxTargetIndex!==undefined&&d.trainingMaxTargetIndex>=history.length)throw new Error('Future target leakage');}
  }
  return scores;
}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function mean(a){return a.reduce((s,x)=>s+x,0)/a.length;}
function quantileSorted(a,p){const x=(a.length-1)*p,l=Math.floor(x);return a[l]+(a[Math.min(l+1,a.length-1)]-a[l])*(x-l);}
function bootstrapIntervals(rows,confidence,seed){
  const random=rng(seed),B=4000,block=4,n=rows.length;
  const samples=Object.fromEntries(IDS.map(id=>[id,[]]));
  for(let b=0;b<B;b++){
    const sums=Object.fromEntries(IDS.map(id=>[id,0]));let used=0;
    while(used<n){const start=Math.floor(random()*n);for(let k=0;k<block&&used<n;k++,used++){const row=rows[(start+k)%n];for(const id of IDS)sums[id]+=row.models[id].jointLogGain;}}
    for(const id of IDS)samples[id].push(sums[id]/n);
  }
  const alpha=(1-confidence)/2,result={};
  for(const id of IDS){samples[id].sort((a,b)=>a-b);result[id]={confidence,lower:quantileSorted(samples[id],alpha),upper:quantileSorted(samples[id],1-alpha),method:'circular-block percentile bootstrap',blockLength:block,replicates:B,seed};}
  return result;
}
function summarize(rows,simultaneousConfidence,seed){
  const simultaneous=bootstrapIntervals(rows,simultaneousConfidence,seed),ordinary=bootstrapIntervals(rows,.95,seed),out={};
  for(const id of IDS){
    const logGains=rows.map(r=>r.models[id].jointLogGain),briers=rows.map(r=>r.models[id].brier),hist=Array(7).fill(0);
    rows.forEach(r=>hist[r.models[id].top6Matches]++);
    out[id]={drawCount:rows.length,meanJointLogGain:mean(logGains),sumJointLogGain:logGains.reduce((a,b)=>a+b,0),geometricMeanPredictiveLikelihoodRatio:Math.exp(mean(logGains)),meanExactMarginalBrier:mean(briers),brierImprovementOverUniform:mean(rows.map((r,i)=>r.models.uniform.brier-briers[i])),top6MatchHistogram:hist,meanTop6Matches:mean(rows.map(r=>r.models[id].top6Matches)),jointLogGainIntervalAdjusted:simultaneous[id],jointLogGainInterval95:ordinary[id]};
  }
  return out;
}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function main(){
  const spec=JSON.parse(fs.readFileSync(path.join(OUT,'specification.json'),'utf8').replace(/^\uFEFF/,''));
  const input=JSON.parse(fs.readFileSync(DATA,'utf8').replace(/^\uFEFF/,'')),draws=input.draws;
  if(draws.length!==522)throw new Error('Expected 522 draws');
  const warmup=156,devEnd=418,perRound=[];
  for(let t=warmup;t<draws.length;t++){
    perRound.push({index:t,round:draws[t].round,date:draws[t].date,historyDrawCount:t,stage:t<devEnd?'development':'reusedHistoricalTest',actual:draws[t].numbers,models:evaluate(draws.slice(0,t),draws[t].numbers)});
    if((t-warmup+1)%100===0)console.log('Evaluated '+(t-warmup+1)+' rounds without viewing scores');
  }
  const dev=perRound.filter(r=>r.stage==='development'),test=perRound.filter(r=>r.stage==='reusedHistoricalTest');
  const confidence=1-.05/6,development=summarize(dev,confidence,20260913),reusedHistoricalTest=summarize(test,confidence,20260914);
  let selected='uniform';for(const id of IDS)if(development[id].meanJointLogGain>development[selected].meanJointLogGain)selected=id;
  const next=forecastAll(draws),nextForecast={};
  for(const id of IDS){
    const f=next[id];
    nextForecast[id]=id==='lag_mixture'?{distribution:'mixture',components:f.components,marginals:f.marginals,top6:topSix(f.marginals),diagnostics:{componentCount:6,componentProbability:1/6,normalization:'Each product-weight component is normalized separately before mixing',noSingleEquivalentProductWeightsClaimed:true}}:{distribution:'product-weight',weights:f.weights,marginals:f.marginals,logNormalizer:f.logZ,top6:topSix(f.weights),diagnostics:f.diagnostics};
  }
  const report={
    metadata:{title:'Prespecified lag-conditional Lotto forecasting exploration',createdAtUtc:new Date().toISOString(),referenceDate:'2026-09-13',source:input.metadata,firstRound:draws[0].round,lastRound:draws.at(-1).round,drawCount:draws.length,dataSha256:sha(DATA),codeSha256:{'lag-models.cjs':sha(path.join(OUT,'lag-models.cjs')),'run-lag-experiment.cjs':sha(__filename),'verify-lag-models.cjs':sha(path.join(OUT,'verify-lag-models.cjs')),'specification.json':sha(path.join(OUT,'specification.json'))},freshHoldout:false,exploratory:true,definitionsFixedBeforeScores:true},
    specification:spec,modelDefinitions:[...L.MODELS.map(m=>({...m,priorStrength:m.id==='uniform'?null:80,minimumSupport:m.type==='pair'?8:null})),{id:'lag_mixture',label:'6개 분포 동일 비중 혼합',type:'mixture',componentModels:L.MODELS.map(m=>m.id),componentProbability:1/6}],
    splits:{warmup:{count:156,firstRound:draws[0].round,lastRound:draws[155].round},development:{count:dev.length,firstRound:dev[0].round,lastRound:dev.at(-1).round},reusedHistoricalTest:{count:test.length,firstRound:test[0].round,lastRound:test.at(-1).round,freshHoldout:false,interpretation:'Exploratory historical reuse; previously inspected in earlier experiments.'}},
    primaryMetric:{name:'exact unordered-six joint log-score gain versus uniform',unit:'natural-log nats per draw',higherIsBetter:true,uniformLogProbability:-LOG_BASE,productFormula:'sum(log(weight_actual))-log(ESP6(weights))+log(C(45,6))',mixtureFormula:'logsumexp(component log-probabilities)-log(6)+log(C(45,6))'},
    inference:{alternatives:6,approximateFamilywiseAlpha:.05,adjustedIndividualConfidence:confidence,selectedConfidence:.95,bootstrap:'circular blocks of length 4, 4000 percentile replicates; paired indices across models',intervalInterpretation:'Exploratory approximate intervals; neither fresh confirmation nor guaranteed coverage. Selected 95% interval does not adjust for model selection.'},
    selection:{criterion:'development meanJointLogGain, uniform included',selectedModel:selected,developmentMeanJointLogGain:development[selected].meanJointLogGain,reusedHistoricalTestMeanJointLogGain:reusedHistoricalTest[selected].meanJointLogGain,reusedHistoricalTestInterval95:reusedHistoricalTest[selected].jointLogGainInterval95},
    summary:{development,reusedHistoricalTest},nextForecastContext:{historyDrawCount:draws.length,lastKnownRound:draws.at(-1).round,lastKnownDate:draws.at(-1).date,predictionIndex:draws.length},nextForecast,perRound,
    limitations:['The last 104 draws are reused historical observations, not a fresh untouched holdout.','Model definitions and the exact-mixture addition were fixed before any scores in this experiment were computed or viewed.','Six candidate alternatives use approximate Bonferroni intervals; bootstrap coverage remains approximate.','The selected-model 95% interval is unadjusted for selection and historical reuse.','A favorable historical score cannot establish extreme or guaranteed future lottery winning probabilities.','Top-six match counts describe deterministic ranked numbers, not performance of five purchased tickets.','Product-weight probabilities are modeling assumptions; lottery outcome probabilities remain uniform under a fair independent draw.']
  };
  fs.writeFileSync(path.join(OUT,'lag-model-report.json'),JSON.stringify(report,null,2)+'\n');
  const rows=IDS.map(id=>`| ${id} | ${development[id].meanJointLogGain.toFixed(6)} | ${reusedHistoricalTest[id].meanJointLogGain.toFixed(6)} | ${reusedHistoricalTest[id].jointLogGainIntervalAdjusted.lower.toFixed(6)}, ${reusedHistoricalTest[id].jointLogGainIntervalAdjusted.upper.toFixed(6)} | ${reusedHistoricalTest[id].meanExactMarginalBrier.toFixed(6)} |`);
  const md=`# 회차 간 조건부 예측 탐색 실험\n\n522회 공식 기록에서 처음 156회 준비, 다음 262회 개발 선택, 마지막 104회 재사용 과거검증으로 평가했습니다. 마지막 구간은 이전 분석에서 관찰되어 새 독립 검증이 아닙니다.\n\n주지표는 실제 당첨 여섯 번호 전체의 정확한 공동 로그점수입니다. 양수일수록 균등 모델보다 높은 예측확률을 부여했습니다. 다섯 시차 모델과 정확한 6개 분포 혼합을 포함한 정의는 이 실험 점수 계산 전에 고정했습니다.\n\n| 모델 | 개발 평균 로그차 | 재사용검증 평균 로그차 | 검증 99.1667% 구간 | 검증 Brier |\n|---|---:|---:|---|---:|\n${rows.join('\n')}\n\n개발 선택: **${selected}**. 재사용 과거검증 평균 로그차 ${reusedHistoricalTest[selected].meanJointLogGain.toFixed(6)}, 선택모델 95% 구간 [${reusedHistoricalTest[selected].jointLogGainInterval95.lower.toFixed(6)}, ${reusedHistoricalTest[selected].jointLogGainInterval95.upper.toFixed(6)}].\n\n구간은 길이4 원형블록 부트스트랩 4,000회이며, 99.1667%는 비교대안6개의 Bonferroni 근사 보정입니다. 선택모델 95% 구간은 선택·과거 재사용을 보정하지 않습니다. 역사적 점수는 미래 당첨확률의 극적 개선을 입증하지 않습니다.\n\n모든 예측 시점 t는 history[0..t-1]만 사용했습니다. 시차 L의 현재 조건은 t-L이고, 학습의 모든 source s → target s+L은 s+L<t를 만족합니다.\n\n혼합 모델은 6개 정규화 조합확률을 평균했습니다. 평균 가중치로 대체하지 않았습니다. 다음 회차용 혼합 정보에는 각 구성모델의 가중치와 비중1/6만 저장했습니다.\n`;
  fs.writeFileSync(path.join(OUT,'FINDINGS.ko.md'),md);
  console.log(JSON.stringify({selectedModel:selected,development:Object.fromEntries(IDS.map(id=>[id,development[id].meanJointLogGain])),reusedHistoricalTest:Object.fromEntries(IDS.map(id=>[id,{mean:reusedHistoricalTest[id].meanJointLogGain,ci:reusedHistoricalTest[id].jointLogGainIntervalAdjusted}])),report:path.join(OUT,'lag-model-report.json')},null,2));
}
module.exports={exactDistribution,logMeanExp,topSix,scoreForecast,forecastAll,evaluate,bootstrapIntervals};
if(require.main===module)main();
