(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./core.js'):root.LottoCore;
  const ONE={3:194130,4:11350,5:235,6:1};
  function randomBaseline(amount,hits){
    if(!Number.isInteger(amount)||amount<0||amount>20||!Object.hasOwn(ONE,hits))throw new Error('확률 계산 범위가 올바르지 않습니다.');
    let logNoWin=0;
    for(let i=0;i<amount;i++)logNoWin+=Math.log1p(-ONE[hits]/(C.TOTAL-i));
    return -Math.expm1(logNoWin);
  }
  function analyze(tickets){
    if(!Array.isArray(tickets)||tickets.length<1||tickets.length>20||Array.from(tickets).some(t=>!C.validNumbers(t,6))||new Set(tickets.map(C.key)).size!==tickets.length)throw new Error('서로 다른 유효 조합 1~20개가 필요합니다.');
    const m=tickets.length,usage=Array(45).fill(0),edges=Array.from({length:m},()=>Array(m).fill(0));
    tickets.forEach(t=>t.forEach(n=>usage[n-1]++));
    let overlappingPairs=0,triangles=0,quadruples=0;
    for(let a=0;a<m;a++)for(let b=a+1;b<m;b++){
      const shared=tickets[a].filter(n=>tickets[b].includes(n));
      if(shared.length>1)throw new Error('이 계산은 두 게임이 최대 1개 번호를 공유하는 배치에만 적용됩니다.');
      if(shared.length){edges[a][b]=edges[b][a]=shared[0];overlappingPairs++;}
    }
    for(let a=0;a<m;a++)for(let b=a+1;b<m;b++)for(let c=b+1;c<m;c++){
      const triple=[edges[a][b],edges[a][c],edges[b][c]];
      if(triple.includes(0)||new Set(triple).size!==3)continue;
      triangles++;
      for(let d=c+1;d<m;d++){
        const six=[...triple,edges[a][d],edges[b][d],edges[c][d]];
        if(!six.includes(0)&&new Set(six).size===6)quadruples++;
      }
    }
    // Exact inclusion-exclusion for linear 6-subset portfolios: no five tickets
    // can each have >=3 hits among only six winning balls. Verified independently
    // by exhaustive enumeration, not estimated from historical lottery results.
    const favorable={3:m*ONE[3]-400*m*(m-1)/2-3300*overlappingPairs+64*triangles-quadruples,4:m*ONE[4],5:m*ONE[5],6:m};
    const probabilities=Object.fromEntries([3,4,5,6].map(k=>[k,{favorable:favorable[k],probability:favorable[k]/C.TOTAL,randomBaseline:randomBaseline(m,k)}]));
    return {games:m,total:C.TOTAL,usage,distinctNumbers:usage.filter(x=>x>0).length,minimumUsage:Math.min(...usage),maximumUsage:Math.max(...usage),maxOverlap:overlappingPairs?1:0,overlappingPairs,triangles,quadruples,probabilities};
  }
  function generate(templates,amount=5,rng=C.randomInt){
    if(!Number.isInteger(amount)||amount<1||amount>20)throw new Error('게임 수는 1~20개 중에서 선택해 주세요.');
    const template=templates?.templates?.[amount]?.tickets;
    if(!template||template.length!==amount)throw new Error('이 게임 수의 배치 자료를 찾을 수 없습니다.');
    analyze(template);
    const shuffle=values=>{for(let i=values.length-1;i>0;i--){const j=rng(i+1);if(!Number.isInteger(j)||j<0||j>i)throw new Error('난수 값이 올바르지 않습니다.');[values[i],values[j]]=[values[j],values[i]];}return values;};
    const labels=shuffle(Array.from({length:45},(_,i)=>i+1));
    const numbers=shuffle(template.map(t=>t.map(n=>labels[n-1]).sort((a,b)=>a-b)));
    return {numbers,profile:analyze(numbers),method:'linear-portfolio-v4'};
  }
  const api={ONE,randomBaseline,analyze,generate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LottoPortfolio=api;
})(typeof window!=='undefined'?window:globalThis);
