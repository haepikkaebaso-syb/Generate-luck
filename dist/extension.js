(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./core.js'):root.LottoCore;
  const P=typeof module!=='undefined'&&module.exports?require('./portfolio.js'):root.LottoPortfolio;
  const EMBEDDING_STEPS=1600,SEARCH_CANDIDATES=12,UNIQUE_ATTEMPTS=64,REFINEMENT_CHECKS=240,REFINEMENT_MOVES=4;
  const PAIR_COVERAGE=[400,3700,13900,31470,60486,109770,194130];
  const overlap=(a,b)=>a.reduce((n,x)=>n+Number(b.includes(x)),0);
  function shuffle(values,rng){
    const out=values.slice();
    for(let i=out.length-1;i>0;i--){const j=rng(i+1);if(!Number.isInteger(j)||j<0||j>i)throw new Error('난수 값이 올바르지 않습니다.');[out[i],out[j]]=[out[j],out[i]];}
    return out;
  }
  function linearProfile(rows){
    if(!rows.length||rows.length>20)return null;
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(overlap(rows[i],rows[j])>1)return null;
    return P.analyze(rows);
  }
  function isGlobalMaximum(profile){
    if(!profile)return false;
    const m=profile.games,count=profile.probabilities[3].favorable;
    return m<=7?count===m*194130-400*m*(m-1)/2:m===8&&count===1532004;
  }
  function signatureCounts(signatures){
    const counts=new Map();for(let n=1;n<=45;n++)counts.set(signatures[n],(counts.get(signatures[n])||0)+1);
    return counts;
  }
  function equalCounts(actual,expected){
    if(actual.size!==expected.size)return false;
    for(const [key,count] of actual)if(expected.get(key)!==count)return false;
    return true;
  }
  // Match selected template rows to saved rows. Incidence signatures also
  // distinguish a shared hub from three distinct pairwise intersections.
  // This is a bounded existence search, never an assertion of impossibility.
  function embed(template,saved,rng){
    const n=saved.length,m=template.length;
    const edges=rows=>rows.map((a,i)=>rows.map((b,j)=>i===j?0:overlap(a,b)));
    const se=edges(saved),te=edges(template),sd=se.map(row=>row.reduce((a,b)=>a+b,0)),td=te.map(row=>row.reduce((a,b)=>a+b,0));
    const order=shuffle(Array.from({length:n},(_,i)=>i),rng).sort((a,b)=>sd[b]-sd[a]);
    const rowOrder=shuffle(Array.from({length:m},(_,i)=>i),rng);
    const expected=[],actualSignatures=new Int32Array(46),templateSignatures=new Int32Array(46);
    for(let depth=0;depth<n;depth++){
      for(const value of saved[order[depth]])actualSignatures[value]|=1<<depth;
      expected.push(signatureCounts(actualSignatures));
    }
    const selected=[],used=new Set();let steps=0;
    function search(depth){
      if(depth===n)return true;
      const savedIndex=order[depth];
      for(const row of rowOrder){
        if(++steps>EMBEDDING_STEPS)return false;
        if(used.has(row)||td[row]<sd[savedIndex])continue;
        if(selected.some((old,j)=>te[row][old]!==se[savedIndex][order[j]]))continue;
        const bit=1<<depth;
        for(const value of template[row])templateSignatures[value]|=bit;
        const compatible=equalCounts(signatureCounts(templateSignatures),expected[depth]);
        if(compatible){selected.push(row);used.add(row);if(search(depth+1))return true;used.delete(row);selected.pop();}
        for(const value of template[row])templateSignatures[value]&=~bit;
      }
      return false;
    }
    if(!search(0))return {numbers:null,steps};
    const realGroups=new Map(),templateGroups=new Map();
    for(let value=1;value<=45;value++){
      const a=actualSignatures[value],b=templateSignatures[value];
      if(!realGroups.has(a))realGroups.set(a,[]);realGroups.get(a).push(value);
      if(!templateGroups.has(b))templateGroups.set(b,[]);templateGroups.get(b).push(value);
    }
    const labels=new Int32Array(46);
    for(const [signature,values] of templateGroups){
      const actual=shuffle(realGroups.get(signature),rng);values.forEach((value,i)=>{labels[value]=actual[i];});
    }
    const numbers=shuffle(template.filter((_,i)=>!used.has(i)).map(row=>row.map(value=>labels[value]).sort((a,b)=>a-b)),rng);
    return {numbers,steps};
  }
  // Only the new tickets are relabelled. This preserves their linear structure;
  // the saved rows remain fixed. Strict exact-score improvements are accepted.
  function refine(initial,evaluate,denied,rng,budget){
    let best=initial,checks=0,accepted=0;
    if(budget===0||best.favorable<0)return {best,checks,accepted};
    const labels=shuffle(Array.from({length:45},(_,i)=>i+1),rng);
    for(let move=0;move<REFINEMENT_MOVES&&checks<budget;move++){
      const signatures=new Int32Array(46);
      best.numbers.forEach((row,i)=>row.forEach(n=>{signatures[n]|=1<<i;}));
      let improved=false;
      search:for(let a=0;a<labels.length;a++)for(let b=a+1;b<labels.length;b++){
        const left=labels[a],right=labels[b];
        if(signatures[left]===signatures[right])continue;
        if(checks>=budget)break search;
        checks++;
        const numbers=best.numbers.map(row=>row.map(n=>n===left?right:n===right?left:n).sort((x,y)=>x-y));
        if(numbers.some(row=>denied.has(C.key(row))))continue;
        const candidate=evaluate(numbers);
        if(candidate.favorable>best.favorable){best=candidate;accepted++;improved=true;break search;}
        if(candidate.exactBudgetExhausted)break search;
      }
      if(!improved)break;
    }
    return {best,checks,accepted};
  }
  function extend(templates,savedTickets,amount=5,rng=C.randomInt,options={}){
    if(!Number.isInteger(amount)||amount<1||amount>20)throw new Error('게임 수는 1~20개 중에서 선택해 주세요.');
    if(!Array.isArray(savedTickets)||Array.from(savedTickets).some(row=>!C.validNumbers(row,6)))throw new Error('보관 번호는 유효한 6개 번호 조합이어야 합니다.');
    if(!options||typeof options!=='object')throw new Error('추가 구성 옵션이 올바르지 않습니다.');
    const evaluateRound=options.evaluateRound,exactLimit=options.maxExactEvaluations??24,refinementBudget=options.refinementBudget??REFINEMENT_CHECKS;
    if(evaluateRound!==undefined&&typeof evaluateRound!=='function')throw new Error('정확 확률 평가 함수가 올바르지 않습니다.');
    if(!Number.isInteger(exactLimit)||exactLimit<SEARCH_CANDIDATES||exactLimit>32)throw new Error('정확 평가 횟수는 12~32회로 제한해 주세요.');
    if(!Number.isInteger(refinementBudget)||refinementBudget<0||refinementBudget>480)throw new Error('추가 탐색 횟수는 0~480회로 제한해 주세요.');
    const saved=[...new Map(savedTickets.map(row=>{const copy=row.slice().sort((a,b)=>a-b);return [C.key(copy),copy];})).values()];
    const denied=new Set(saved.map(C.key)),total=saved.length+amount;
    let exactEvaluationCalls=0;
    function result(numbers,status,reason,attempts=0,templateGames=null,search=null){
      if(numbers.length!==amount||numbers.some(row=>denied.has(C.key(row)))||new Set(numbers.map(C.key)).size!==amount)throw new Error('보관함과 겹치지 않는 새 배치를 만들지 못했습니다. 다시 시도해 주세요.');
      const profile=P.analyze(numbers),roundProfile=linearProfile([...saved,...numbers]);
      const exactRoundFavorable=search?.finalFavorable??roundProfile?.probabilities[3].favorable??null;
      return {numbers,profile,roundProfile,method:'saved-'+status+'-v2',extension:{status,savedUnique:saved.length,roundGames:total,globalOptimal:isGlobalMaximum(roundProfile),templateGames,attempts,reason,exactRoundFavorable,exactEvaluationCalls,search}};
    }
    if(!saved.length){
      const generated=P.generate(templates,amount,rng);
      return result(generated.numbers,'standalone','현재 묶음 전체를 함께 구성했습니다.',1,amount);
    }
    const usedNumbers=new Set(saved.flat()),unused=Array.from({length:45},(_,i)=>i+1).filter(n=>!usedNumbers.has(n));
    // Preserve old tickets even when they are nonlinear. If enough unused
    // labels remain, new tickets can avoid all old and new overlaps entirely.
    if(unused.length>=amount*6){
      const labels=shuffle(unused,rng),numbers=Array.from({length:amount},(_,i)=>labels.slice(i*6,i*6+6).sort((a,b)=>a-b));
      return result(numbers,'disjoint','보관한 번호와 겹치지 않게 새 번호를 배치했습니다.');
    }
    const savedProfile=linearProfile(saved);
    let embeddingSteps=0;
    if(total<=20&&savedProfile){
      const template=templates?.templates?.[total]?.tickets;
      if(template&&template.length===total){
        P.analyze(template);
        const embedded=embed(template,saved,rng);embeddingSteps=embedded.steps;
        if(embedded.numbers)return result(embedded.numbers,'template-extension','보관한 조합을 유지하면서 같은 회차 전체를 검증된 배치로 연결했습니다.',embeddingSteps,total);
      }
    }
    function evaluate(numbers){
      let penalty=0,crossLinear=true;
      for(const a of saved)for(const b of numbers){const count=overlap(a,b);penalty+=PAIR_COVERAGE[count]-400;if(count>1)crossLinear=false;}
      const combined=total<=20&&savedProfile&&crossLinear?P.analyze([...saved,...numbers]):null;
      let favorable=combined?combined.probabilities[3].favorable:-1,exactBudgetExhausted=false;
      if(favorable<0&&evaluateRound){
        if(exactEvaluationCalls<exactLimit){
          exactEvaluationCalls++;
          favorable=evaluateRound([...saved,...numbers].map(row=>row.slice()));
          if(!Number.isInteger(favorable)||favorable<0||favorable>C.TOTAL)throw new Error('정확 확률 평가 결과가 올바르지 않습니다.');
        }else exactBudgetExhausted=true;
      }
      return {numbers,favorable,penalty,combined,exactBudgetExhausted};
    }
    let best=null,accepted=0,attempts=0;
    for(;attempts<UNIQUE_ATTEMPTS&&accepted<SEARCH_CANDIDATES;attempts++){
      // A label rotation prevents a constant injected RNG from repeating the
      // same blocked portfolio on every attempt. It preserves the structure.
      const generated=P.generate(templates,amount,rng);
      const numbers=generated.numbers.map(row=>row.map(n=>(n-1+attempts)%45+1).sort((a,b)=>a-b));
      if(numbers.some(row=>denied.has(C.key(row))))continue;
      accepted++;
      const candidate=evaluate(numbers);
      if(!best||candidate.favorable>best.favorable||(candidate.favorable===best.favorable&&candidate.penalty<best.penalty))best=candidate;
    }
    if(!best)throw new Error('보관함과 겹치지 않는 새 배치를 만들지 못했습니다. 다시 시도해 주세요.');
    const baselineFavorable=best.favorable,refined=isGlobalMaximum(best.combined)?{best,checks:0,accepted:0}:refine(best,evaluate,denied,rng,refinementBudget);
    best=refined.best;
    const search={baselineCandidates:accepted,baselineFavorable:baselineFavorable<0?null:baselineFavorable,finalFavorable:best.favorable<0?null:best.favorable,refinementChecks:refined.checks,acceptedImprovements:refined.accepted,exactEvaluationLimit:exactLimit};
    return best.favorable>=0
      ?result(best.numbers,'coverage-search','보관한 조합과 합쳐 정확히 계산한 당첨 범위로 후보를 비교하고, 추가 탐색에서는 그 범위가 커지는 변경만 반영했습니다. 전체 최적을 보장하지는 않습니다.',attempts+embeddingSteps,null,search)
      :result(best.numbers,'overlap-fallback','보관한 조합과의 겹침이 적은 후보를 골랐습니다. 같은 회차 전체의 5등 이상 확률은 계산하지 않았습니다.',attempts+embeddingSteps,null,search);
  }
  const api={extend};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LottoExtension=api;
})(typeof window!=='undefined'?window:globalThis);
