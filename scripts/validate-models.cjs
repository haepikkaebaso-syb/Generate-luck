'use strict';
// Protocol fixed before reading performance: 156 warm-up, 262 development, final104 holdout;
// four alternatives; model selection by development Brier, not holdout or lucky tickets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const R=require('../dist/research.js');
const sourcePath=path.join(__dirname,'../data/draws.json');
const {draws,metadata}=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const WARMUP=156,HOLDOUT=104,REPEATS=256,BOOTSTRAPS=4000,BLOCK=4;
if(draws.length<=WARMUP+HOLDOUT)throw new Error('검증에 필요한 기록이 부족합니다.');
const SPLIT=draws.length-HOLDOUT,BASE=26/225;
const ids=R.MODELS.map(m=>m.id),rows=Object.fromEntries(ids.map(id=>[id,[]]));
function mean(values){return values.every(v=>v===values[0])?values[0]:values.reduce((a,b)=>a+b,0)/values.length;}
function interval(values,alpha=0.05){
  const rng=R.seededRandom(914521),estimates=[];
  for(let repeat=0;repeat<BOOTSTRAPS;repeat++){
    const sample=[];while(sample.length<values.length){const start=Math.floor(rng()*values.length);for(let j=0;j<BLOCK&&sample.length<values.length;j++)sample.push(values[(start+j)%values.length]);}
    estimates.push(mean(sample));
  }
  estimates.sort((a,b)=>a-b);return [estimates[Math.floor(BOOTSTRAPS*alpha/2)],estimates[Math.min(BOOTSTRAPS-1,Math.floor(BOOTSTRAPS*(1-alpha/2)))]];
}
function repeatedPortfolio(space,draw,index){
  let hits=0,prizes=0;
  const win=new Set(draw.numbers);
  for(let repeat=0;repeat<REPEATS;repeat++){
    const rng=R.seededRandom(0x17a21+Math.imul(index+1,100003)+Math.imul(repeat+1,7919));
    let any=false;const seen=new Set();
    for(let game=0;game<5;game++){
      let ticket,key;do{ticket=space.sample(rng);key=ticket.join('-');}while(seen.has(key));seen.add(key);
      const n=ticket.filter(v=>win.has(v)).length;hits+=n;if(n>=3)any=true;
    }
    if(any)prizes++;
  }
  return {anyPrize:prizes/REPEATS,meanMatches:hits/(REPEATS*5)};
}
for(let index=WARMUP;index<draws.length;index++){
  const history=draws.slice(0,index),draw=draws[index],win=new Set(draw.numbers);
  for(const id of ids){
    const weights=R.fitWeights(history,id),space=R.weightedSpace(weights),p=space.marginals();
    const brier=id==='uniform'?BASE:mean(p.map((prob,i)=>(prob-(win.has(i+1)?1:0))**2));
    const top=p.map((v,i)=>({n:i+1,v})).sort((a,b)=>b.v-a.v||a.n-b.n).slice(0,6).map(x=>x.n);
    const topMatches=top.filter(n=>win.has(n)).length;
    const portfolio=id==='uniform' ? {anyPrize:1-Array.from({length:5},(_,i)=>(8145060-194130-i)/(8145060-i)).reduce((a,b)=>a*b,1),meanMatches:0.8} : repeatedPortfolio(space,draw,index);
    rows[id].push({round:draw.round,date:draw.date,phase:index<SPLIT?'development':'holdout',brier,topMatches,...portfolio});
  }
  if((index-WARMUP)%60===0)console.log(`검증 ${index-WARMUP+1}/${draws.length-WARMUP}회 완료`);
}
function summarize(records){
  const improvements=records.map(r=>BASE-r.brier);
  return {count:records.length,firstRound:records[0].round,lastRound:records.at(-1).round,firstDate:records[0].date,lastDate:records.at(-1).date,brier:mean(records.map(r=>r.brier)),skill:mean(improvements)/BASE,improvement:mean(improvements),improvementCI95:interval(improvements),improvementCI9875:interval(improvements,0.0125),topMeanMatches:mean(records.map(r=>r.topMatches)),topAtLeast3:records.filter(r=>r.topMatches>=3).length,anyPrizeRate:mean(records.map(r=>r.anyPrize)),anyPrizeVsRandomCI95:interval(records.map(r=>r.anyPrize-rows.uniform[0].anyPrize)),meanTicketMatches:mean(records.map(r=>r.meanMatches))};
}
const models=R.MODELS.map(model=>({...model,development:summarize(rows[model.id].filter(r=>r.phase==='development')),holdout:summarize(rows[model.id].filter(r=>r.phase==='holdout'))}));
const selected=[...models].sort((a,b)=>a.development.brier-b.development.brier)[0];
const h=selected.holdout;
const report={
  protocol:{version:'2026-09-13-v1',warmup:WARMUP,holdout:HOLDOUT,development:SPLIT-WARMUP,selectionMetric:'Lowest development Brier; ties in fixed model order',distribution:'Probability of an unordered ticket proportional to product of its six weights. Exact inclusion marginals from elementary symmetric polynomials are used for Brier. These are model probabilities, not established future draw probabilities.',shrinkageDraws:20,modelIds:ids,portfolioGames:5,portfolioRepeats:REPEATS,portfolioSeed:'mulberry32(0x17a21+(index+1)*100003+(repeat+1)*7919)',bootstrapReplicates:BOOTSTRAPS,bootstrapBlockRounds:BLOCK,primaryMetric:'mean squared inclusion-probability error across 45 numbers',baselineBrier:BASE,multipleComparison:'Four alternative holdout Brier intervals use 98.75% pointwise bootstrap intervals (Bonferroni-style 95% family coverage); bootstrap is approximate.',limits:'Retrospective walk-forward experiment on already public results, not a prospective trial. 256 seeds are repetitions on the same draws, not independent new draws. Five-ticket rates are Monte Carlo estimates except uniform baseline. No guaranteed future advantage.'},
  data:{count:draws.length,firstDate:draws[0].date,lastDate:draws.at(-1).date,sha256:crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),source:metadata.sourcePageUrl},
  models,selectedModel:selected.id,selectedLabel:selected.label,selectedHoldoutSupportsAdvantage:selected.id!=='uniform'&&h.improvementCI95[0]>0,
  anyAlternativeHoldoutSupportsAdvantage:models.some(m=>m.id!=='uniform'&&m.holdout.improvementCI9875[0]>0),
  nextForecast:models.map(m=>({id:m.id,label:m.label,weights:R.fitWeights(draws,m.id),modelInclusionProbabilities:R.weightedSpace(R.fitWeights(draws,m.id)).marginals()})),
  perRound:rows,
  references:[{title:'동행복권 로또 6/45 안내',url:'https://m.dhlottery.co.kr/lt645/intro'},{title:'시계열 교차검증',url:'https://otexts.com/fpp3/tscv.html'},{title:'Gneiting & Raftery (2007), Proper Scoring Rules',url:'https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf'},{title:'NIST Bonferroni method',url:'https://www.itl.nist.gov/div898/handbook/prc/section4/prc463.htm'}]
};
fs.writeFileSync(path.join(__dirname,'../data/validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({selected:report.selectedLabel,advantage:report.selectedHoldoutSupportsAdvantage,models:models.map(m=>({id:m.id,dev:m.development.brier,holdout:m.holdout.brier,anyPrize:m.holdout.anyPrizeRate,CI:m.holdout.improvementCI95}))},null,2));
