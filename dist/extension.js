(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./core.js'):root.LottoCore;
  const P=typeof module!=='undefined'&&module.exports?require('./portfolio.js'):root.LottoPortfolio;
  const EMBEDDING_STEPS=1600,SEARCH_CANDIDATES=12,UNIQUE_ATTEMPTS=64;
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
  function extend(templates,savedTickets,amount=5,rng=C.randomInt){
    if(!Number.isInteger(amount)||amount<1||amount>20)throw new Error('게임 수는 1~20개 중에서 선택해 주세요.');
    if(!Array.isArray(savedTickets)||Array.from(savedTickets).some(row=>!C.validNumbers(row,6)))throw new Error('보관 번호는 유효한 6개 번호 조합이어야 합니다.');
    const saved=[...new Map(savedTickets.map(row=>{const copy=row.slice().sort((a,b)=>a-b);return [C.key(copy),copy];})).values()];
    const denied=new Set(saved.map(C.key)),total=saved.length+amount;
    function result(numbers,status,reason,attempts=0,templateGames=null){
      if(numbers.length!==amount||numbers.some(row=>denied.has(C.key(row)))||new Set(numbers.map(C.key)).size!==amount)throw new Error('보관함과 겹치지 않는 새 배치를 만들지 못했습니다. 다시 시도해 주세요.');
      const profile=P.analyze(numbers),roundProfile=linearProfile([...saved,...numbers]);
      return {numbers,profile,roundProfile,method:'saved-'+status+'-v1',extension:{status,savedUnique:saved.length,roundGames:total,globalOptimal:isGlobalMaximum(roundProfile),templateGames,attempts,reason}};
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
    let best=null,accepted=0,attempts=0;
    for(;attempts<UNIQUE_ATTEMPTS&&accepted<SEARCH_CANDIDATES;attempts++){
      // A label rotation prevents a constant injected RNG from repeating the
      // same blocked portfolio on every attempt. It preserves the structure.
      const generated=P.generate(templates,amount,rng);
      const numbers=generated.numbers.map(row=>row.map(n=>(n-1+attempts)%45+1).sort((a,b)=>a-b));
      if(numbers.some(row=>denied.has(C.key(row))))continue;
      accepted++;
      let penalty=0,crossLinear=true;
      for(const a of saved)for(const b of numbers){const count=overlap(a,b);penalty+=PAIR_COVERAGE[count]-400;if(count>1)crossLinear=false;}
      const combined=total<=20&&savedProfile&&crossLinear?P.analyze([...saved,...numbers]):null;
      const favorable=combined?combined.probabilities[3].favorable:-1;
      if(!best||favorable>best.favorable||(favorable===best.favorable&&penalty<best.penalty))best={numbers,favorable,penalty,combined};
    }
    if(!best)throw new Error('보관함과 겹치지 않는 새 배치를 만들지 못했습니다. 다시 시도해 주세요.');
    return best.combined
      ?result(best.numbers,'coverage-search','보관한 조합과 합쳐 정확히 계산할 수 있는 후보 중 당첨 범위가 큰 배치를 골랐습니다. 전체 최적을 보장하지는 않습니다.',attempts+embeddingSteps)
      :result(best.numbers,'overlap-fallback','보관한 조합과의 겹침이 적은 후보를 골랐습니다. 같은 회차 전체의 5등 이상 확률은 계산하지 않았습니다.',attempts+embeddingSteps);
  }
  const api={extend};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LottoExtension=api;
})(typeof window!=='undefined'?window:globalThis);
