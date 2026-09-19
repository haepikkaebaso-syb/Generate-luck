'use strict';
// 1등 당첨금 분할 위험 모형: 공식 회차별 1등 당첨자 수를 당첨번호 합계로 설명하는 포아송 회귀.
// 노출량은 1등 총당첨금(당첨자 수 × 1인당 금액)으로, 판매량에 거의 비례한다.
// 당첨 확률 예측이 아니다. 추첨은 균등하며, 이 모형은 '사람들이 어떤 번호를 많이 사는가'만 추정한다.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=JSON.parse(fs.readFileSync(path.join(root,'data/draws.json'),'utf8'));
const draws=source.draws.slice().sort((a,b)=>a.round-b.round);
if(draws.some(d=>!(d.firstPrizeWinners>0)||!(d.firstPrizePerWinner>0)))throw new Error('1등 당첨자 수·당첨금이 없는 회차가 있습니다.');
const CENTER=138,SCALE=100; // 6개 번호 합계의 이론 평균 138
const y=draws.map(d=>d.firstPrizeWinners);
const exposure=draws.map(d=>d.firstPrizeWinners*d.firstPrizePerWinner/2e9);
const x=draws.map(d=>(d.numbers.reduce((a,b)=>a+b,0)-CENTER)/SCALE);
function fit(index,useSum=true){
  let a=Math.log(index.reduce((s,i)=>s+y[i],0)/index.reduce((s,i)=>s+exposure[i],0)),b=0,info=null;
  for(let iteration=0;iteration<100;iteration++){
    let g0=0,g1=0,h00=0,h01=0,h11=0;
    for(const i of index){const mu=exposure[i]*Math.exp(a+b*x[i]);g0+=y[i]-mu;g1+=(y[i]-mu)*x[i];h00+=mu;h01+=mu*x[i];h11+=mu*x[i]*x[i];}
    if(!useSum){a+=g0/h00;info={h00,det:0};if(Math.abs(g0/h00)<1e-12)break;continue;}
    const det=h00*h11-h01*h01,da=(h11*g0-h01*g1)/det,db=(h00*g1-h01*g0)/det;a+=da;b+=db;info={h00,det};
    if(Math.abs(da)+Math.abs(db)<1e-12)break;
  }
  const pearson=index.reduce((s,i)=>{const mu=exposure[i]*Math.exp(a+b*x[i]);return s+(y[i]-mu)**2/mu;},0);
  const dispersion=pearson/(index.length-(useSum?2:1));
  return {intercept:a,beta:b,standardError:useSum?Math.sqrt(info.h00/info.det*dispersion):null,dispersion,draws:index.length};
}
const deviance=(model,index)=>index.reduce((s,i)=>{const mu=exposure[i]*Math.exp(model.intercept+model.beta*x[i]);return s+2*(y[i]*Math.log(y[i]/mu)-(y[i]-mu));},0);
const all=draws.map((_,i)=>i),FOLDS=10;
// 시간순 연속 블록 교차검증: 학습에 쓰지 않은 회차에서 합계 모형이 상수 모형보다 나은지 확인한다.
let cvNull=0,cvSum=0;
for(let f=0;f<FOLDS;f++){
  const test=all.filter(i=>Math.floor(i*FOLDS/all.length)===f),train=all.filter(i=>!test.includes(i));
  cvNull+=deviance(fit(train,false),test);cvSum+=deviance(fit(train,true),test);
}
const round6=v=>Math.round(v*1e6)/1e6,half=Math.floor(all.length/2);
const full=fit(all),first=fit(all.slice(0,half)),second=fit(all.slice(half)),trimmed=fit(all.filter(i=>y[i]<=30));
const recent=all.slice(-104),sums=draws.map(d=>d.numbers.reduce((a,b)=>a+b,0)).sort((a,b)=>a-b);
const output={
  schemaVersion:1,
  description:'공식 1등 당첨자 수로 추정한 당첨금 분할 위험. 당첨 확률과 무관하며 공동 당첨자 수의 기댓값만 설명합니다.',
  sourceRounds:{first:draws[0].round,last:draws.at(-1).round,count:draws.length},
  model:{form:'log E[1등 당첨자 수] = log(1등 총당첨금) + a + beta × (번호 합계 − 138) / 100',center:CENTER,scale:SCALE,
    beta:round6(full.beta),standardError:round6(full.standardError),z:round6(full.beta/full.standardError),dispersion:round6(full.dispersion)},
  validation:{method:'시간순 10개 연속 블록 교차검증, 포아송 이탈도(작을수록 좋음)',constantModel:round6(cvNull),sumModel:round6(cvSum),improves:cvSum<cvNull,
    firstHalfBeta:round6(first.beta),secondHalfBeta:round6(second.beta),withoutRoundsOver30WinnersBeta:round6(trimmed.beta)},
  // 앱에서 '당첨 시 예상 수령액' 환산에 쓰는 평균 공동 당첨자 수(최근 104회)
  averageWinnersRecent:round6(recent.reduce((s,i)=>s+y[i],0)/recent.length),
  observedSumRange:{p05:sums[Math.floor(sums.length*0.05)],p95:sums[Math.floor(sums.length*0.95)],min:sums[0],max:sums.at(-1)},
};
if(!output.validation.improves||!(output.model.beta<0))throw new Error('합계 모형이 표본 외 검증을 통과하지 못했습니다. 앱에 적용하지 마세요.');
fs.writeFileSync(path.join(root,'data/split-risk.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
