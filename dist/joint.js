(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./core.js'):root.LottoCore;
  const R=typeof module!=='undefined'&&module.exports?require('./research.js'):root.LottoResearch;
  function componentSpace(weights,options={}){
    if(!Array.isArray(weights)||weights.length!==45||weights.some(w=>!Number.isFinite(w)||w<=0))throw new Error('번호 가중치가 올바르지 않습니다.');
    if(['minSum','maxSum','minOdd','maxOdd'].some(k=>options[k]!==undefined))throw new Error('혼합 실험은 고정·제외 번호만 지원합니다.');
    const fixed=options.fixed||[],excluded=options.excluded||[];
    C.createSpace({fixed,excluded});
    const pool=Array.from({length:45},(_,i)=>i+1).filter(n=>!fixed.includes(n)&&!excluded.includes(n)),k=6-fixed.length;
    const scale=k?Math.max(...pool.map(n=>weights[n-1])):1;
    const normalized=weights.map((w,i)=>k&&pool.includes(i+1)?w/scale:1);
    if(normalized.some(w=>w<1e-50))throw new Error('가중치 차이가 지원하는 계산 범위를 벗어났습니다.');
    const source=R.weightedSpace(normalized,fixed,excluded),dp=Array(k+1).fill(0);dp[0]=1;
    for(const n of pool)for(let j=k;j>=1;j--)dp[j]+=dp[j-1]*normalized[n-1];
    const logZ=Math.log(dp[k]);
    function logProbability(numbers){
      if(!C.validNumbers(numbers,6)||fixed.some(n=>!numbers.includes(n))||excluded.some(n=>numbers.includes(n)))return -Infinity;
      return numbers.filter(n=>!fixed.includes(n)).reduce((s,n)=>s+Math.log(normalized[n-1]),0)-logZ;
    }
    return {...source,logProbability};
  }
  function mixtureSpace(components,options={}){
    if(!Array.isArray(components)||!components.length||components.some(c=>!Number.isFinite(c.probability)||c.probability<=0))throw new Error('혼합 모형의 구성 비율이 올바르지 않습니다.');
    if(['minSum','maxSum','minOdd','maxOdd'].some(k=>options[k]!==undefined))throw new Error('혼합 실험은 고정·제외 번호만 지원합니다.');
    const total=components.reduce((s,c)=>s+c.probability,0);
    if(Math.abs(total-1)>1e-9)throw new Error('혼합 모형 비율의 합은 1이어야 합니다.');
    components=components.map(c=>({...c,probability:c.probability/total}));
    const spaces=components.map(c=>componentSpace(c.weights,options));
    function logProbability(numbers){
      const terms=spaces.map((s,i)=>Math.log(components[i].probability)+s.logProbability(numbers)),max=Math.max(...terms);
      return max===-Infinity?-Infinity:max+Math.log(terms.reduce((sum,t)=>sum+Math.exp(t-max),0));
    }
    function sample(rng){
      let target=rng(),index=components.length-1;
      for(let i=0;i<components.length;i++){target-=components[i].probability;if(target<0){index=i;break;}}
      return spaces[index].sample(rng);
    }
    const marginalSets=spaces.map(s=>s.marginals());
    const marginals=()=>Array.from({length:45},(_,i)=>marginalSets.reduce((s,p,j)=>s+components[j].probability*p[i],0));
    return {sample,logProbability,marginals,total:spaces[0].total,unrank:spaces[0].unrank};
  }
  function generateMixture(components,options,amount,blocked=[],rng=()=>C.randomInt(4294967296)/4294967296){
    if(!Number.isInteger(amount)||amount<1||amount>20)throw new Error('한 번에 1~20게임을 생성할 수 있습니다.');
    const space=mixtureSpace(components,options),valid=C.createSpace(options);
    const denied=new Set(blocked.map(C.key)),blockedCount=new Set(blocked.filter(n=>valid.rankOf(n)>=0).map(C.key)).size;
    const available=space.total-blockedCount;
    if(available<amount)throw new Error(`현재 조건에서 생성 가능한 새 조합은 ${available.toLocaleString('ko-KR')}개입니다. 게임 수를 줄이거나 조건을 풀어 주세요.`);
    const numbers=[];
    if(space.total<=2000){
      const candidates=Array.from({length:space.total},(_,i)=>space.unrank(i)).filter(n=>!denied.has(C.key(n))),masses=candidates.map(n=>Math.exp(space.logProbability(n)));
      for(let game=0;game<amount;game++){
        let target=rng()*masses.reduce((a,b)=>a+b,0),index=masses.length-1;
        for(let i=0;i<masses.length;i++){target-=masses[i];if(target<0){index=i;break;}}
        numbers.push(candidates.splice(index,1)[0]);masses.splice(index,1);
      }
    }else{
      for(let tries=0;numbers.length<amount&&tries<20000;tries++){
        const n=space.sample(rng),key=C.key(n);if(!denied.has(key)){numbers.push(n);denied.add(key);}
      }
      if(numbers.length<amount)throw new Error('혼합 모형의 저장 제외 조건이 너무 좁습니다. 조건을 풀어 주세요.');
    }
    return {numbers,total:space.total,available};
  }
  const api={componentSpace,mixtureSpace,generateMixture};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LottoJoint=api;
})(typeof window!=='undefined'?window:globalThis);
