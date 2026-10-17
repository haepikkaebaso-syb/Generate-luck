(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./core.js'):root.LottoCore;
  const P=typeof module!=='undefined'&&module.exports?require('./portfolio.js'):root.LottoPortfolio;
  const E=typeof module!=='undefined'&&module.exports?require('./extension.js'):root.LottoExtension;
  const X=typeof module!=='undefined'&&module.exports?require('./coverage.js'):root.LottoCoverage;
  function profile(exact){
    return {games:exact.uniqueGames,total:exact.total,exact:true,probabilities:{3:{favorable:exact.favorable,probability:exact.probability,randomBaseline:exact.randomBaseline}}};
  }
  function generate(templates,saved,amount,rng=C.randomInt){
    const unique=[...new Map(saved.map(row=>[C.key(row),row])).values()];
    let best=null;
    for(let attempt=0;attempt<(unique.length?8:1);attempt++){
      const candidate=E.extend(templates,unique,amount,rng);
      const value=candidate.roundProfile?.probabilities[3].favorable??-1;
      if(!best||value>(best.roundProfile?.probabilities[3].favorable??-1))best=candidate;
      if(candidate.extension.globalOptimal||['standalone','disjoint','template-extension'].includes(candidate.extension.status))break;
    }
    if(!unique.length||best.roundProfile||unique.length+amount>X.MAX_GAMES)return best;
    // Keep the original valid candidate as a floor; a replacement must cover
    // strictly more possible draws. Stored tickets never enter the mutation set.
    const context=X.createContext(unique);
    let bestExact=context.evaluate(best.numbers),evaluations=1;
    const initialFavorable=bestExact.favorable;
    if(best.extension.status!=='disjoint'){
      const candidate=E.extend(templates,unique,amount,rng,{
        evaluateRound:rows=>{evaluations++;return context.evaluate(rows).favorable;},
        maxExactEvaluations:24,refinementBudget:240
      });
      const exact=context.evaluate(candidate.numbers);evaluations++;
      if(exact.favorable>bestExact.favorable){best=candidate;bestExact=exact;}
    }
    best.roundProfile=profile(bestExact);
    best.extension={...best.extension,status:'exact-coverage-search',globalOptimal:false,
      exactEvaluations:evaluations,initialFavorable,finalFavorable:bestExact.favorable,
      reason:'보관 번호를 유지하고, 회차 전체의 당첨 확률을 정확히 비교해 추가 번호를 골랐습니다.'};
    return best;
  }
  function run(message){
    if(message.type==='coverage')return profile(X.coverageExact(message.numbers));
    if(message.type!=='generate')throw new Error('지원하지 않는 계산입니다.');
    return generate(message.templates,message.saved,message.amount);
  }
  const api={generate,run,profile,MAX_GAMES:X.MAX_GAMES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LottoGeneration=api;
  if(typeof document==='undefined'&&typeof root.postMessage==='function')root.onmessage=event=>{
    try{root.postMessage({ok:true,result:run(event.data)});}
    catch(error){root.postMessage({ok:false,error:error.message});}
  };
})(typeof window!=='undefined'?window:globalThis);
