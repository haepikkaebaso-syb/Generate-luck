(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./core.js'):root.LottoCore;
  const sum=numbers=>numbers.reduce((a,b)=>a+b,0);
  // Relative expected number of co-winners versus an average combination (1 = average).
  // The sum is clamped to the 5th~95th percentile seen in the fitted draws: no credit for extrapolation.
  function crowd(numbers,model,beta=model.model.beta){
    if(!C.validNumbers(numbers,6))throw new Error('유효한 여섯 번호가 필요합니다.');
    const s=Math.min(model.observedSumRange.p95,Math.max(model.observedSumRange.p05,sum(numbers)));
    return Math.exp(beta*(s-model.model.center)/model.model.scale);
  }
  // Shapes that many people mark by hand. Too rare in 522 draws to estimate, so they are simply avoided.
  function pattern(numbers){
    const n=[...numbers].sort((a,b)=>a-b),most=f=>{const seen={};let best=0;for(const v of n)best=Math.max(best,seen[f(v)]=(seen[f(v)]||0)+1);return best;};
    let run=1,longest=1;for(let i=1;i<6;i++){run=n[i]-n[i-1]===1?run+1:1;longest=Math.max(longest,run);}
    if(longest>=3)return '연속 번호 3개 이상';
    if(n[5]<=31)return '모두 31 이하(생일 번호대)';
    if(n.filter(v=>v<=12).length>=4)return '12 이하 4개 이상';
    if(most(v=>Math.floor((v-1)/7))>=4)return '용지 같은 줄 4개 이상';
    if(most(v=>(v-1)%7)>=4)return '용지 같은 칸 4개 이상';
    if(most(v=>v%10)>=4)return '같은 끝수 4개 이상';
    if(new Set(n.slice(1).map((v,i)=>v-n[i])).size===1)return '같은 간격 배열';
    return '';
  }
  // Expected share of the jackpot pool given a win, relative to an average combination.
  // Co-winners ~ Poisson(mu): E[1/(1+K)] = (1-exp(-mu))/mu.
  const share=mu=>-Math.expm1(-mu)/mu;
  function payout(tickets,model,beta){
    const base=model.averageWinnersRecent;
    return tickets.reduce((s,t)=>s+share(base*crowd(t,model,beta)),0)/tickets.length/share(base);
  }
  function assess(tickets,model,past=new Set()){
    const flags=tickets.map(t=>past.has(C.key(t))?'과거 1등 번호와 동일':pattern(t)),se=1.96*model.model.standardError,b=model.model.beta;
    const range=[payout(tickets,model,b+se),payout(tickets,model,b-se)];
    return {flags,flagged:flags.filter(Boolean).length,crowd:tickets.reduce((s,t)=>s+crowd(t,model),0)/tickets.length,payout:payout(tickets,model),payoutLow:Math.min(...range),payoutHigh:Math.max(...range)};
  }
  // Lower is better: first no hand-marked shapes, then the fewest expected co-winners.
  const better=(a,b)=>!b||a.flagged<b.flagged||(a.flagged===b.flagged&&a.payout>b.payout);
  // Swapping two numbers everywhere is still a relabelling of the same layout, so every prize probability is unchanged.
  function repair(tickets,model,past,rng=C.randomInt,blocked=()=>false,tries=4000){
    let numbers=tickets,split=assess(numbers,model,past);
    for(let i=0;i<tries&&split.flagged;i++){
      const a=rng(45)+1,b=rng(45)+1;if(a===b)continue;
      const next=numbers.map(t=>t.map(n=>n===a?b:n===b?a:n).sort((x,y)=>x-y));
      if(next.some(blocked))continue;
      const trial=assess(next,model,past);
      if(trial.flagged<=split.flagged){numbers=next;split=trial;}
    }
    return {numbers,split};
  }
  const api={crowd,pattern,payout,assess,better,repair};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LottoSplit=api;
})(typeof window!=='undefined'?window:globalThis);
