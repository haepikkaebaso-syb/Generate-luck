(function(root){
  'use strict';

  // Exact probability of at least one ticket matching at least three main numbers.
  // Bonus numbers do not affect this event. No assumption about ticket overlap is made.
  // createContext is self-contained, so it can also run in an offline Worker.
  function createContext(savedTickets=[]){
    const TOTAL=8145060,ONE=194130,MAX_GAMES=200;
    const WORDS=Math.ceil(TOTAL/32);
    const invalid='1~45의 서로 다른 정수 6개로 된 조합을 최대 200게임 입력해 주세요.';
    function normalize(input){
      if(!Array.isArray(input)||input.length>MAX_GAMES)throw new Error(invalid);
      const unique=new Map();
      for(const row of input){
        if(!Array.isArray(row)||row.length!==6)throw new Error(invalid);
        const numbers=Array.from(row);
        if(numbers.some(n=>!Number.isInteger(n)||n<1||n>45)||new Set(numbers).size!==6)throw new Error(invalid);
        numbers.sort((a,b)=>a-b);unique.set(numbers.join('-'),numbers);
      }
      return unique;
    }
    function result(favorable,uniqueGames){
      // Expected union coverage of distinct tickets sampled uniformly without replacement.
      let logNoWin=0;
      for(let i=0;i<uniqueGames;i++)logNoWin+=Math.log1p(-ONE/(TOTAL-i));
      return {favorable,total:TOTAL,probability:favorable/TOTAL,uniqueGames,
        randomBaseline:uniqueGames ? -Math.expm1(logNoWin) : 0,jackpot:uniqueGames/TOTAL};
    }
    const saved=normalize(savedTickets);
    const binom=new Uint32Array(46*7);
    for(let n=0;n<=45;n++){
      binom[n*7]=1;
      if(n)for(let k=1;k<=6;k++)binom[n*7+k]=binom[(n-1)*7+k]+binom[(n-1)*7+k-1];
    }
    function combinations(n,k){
      const flat=new Uint8Array(binom[n*7+k]*k),chosen=new Uint8Array(k);let offset=0;
      function visit(start,left){
        if(!left){flat.set(chosen,offset);offset+=k;return;}
        for(let i=start;i<=n-left;i++){chosen[k-left]=i;visit(i+1,left-1);}
      }
      visit(0,k);return flat;
    }
    const inside=[],outside=[],insideValues=[],outsideValues=[];
    for(let hits=3;hits<=6;hits++){
      inside[hits]=combinations(6,hits);outside[hits]=combinations(39,6-hits);
      insideValues[hits]=new Uint8Array(inside[hits].length);
      outsideValues[hits]=new Uint8Array(outside[hits].length);
    }
    const other=new Uint8Array(39);
    function addTicket(bits,ticket){
      let next=0,at=0,added=0;
      for(let n=1;n<=45;n++){if(n===ticket[next])next++;else other[at++]=n;}
      for(let hits=3;hits<=6;hits++){
        const outHits=6-hits,selected=insideValues[hits],outs=outsideValues[hits];
        const selectedIndexes=inside[hits],outIndexes=outside[hits];
        for(let i=0;i<selected.length;i++)selected[i]=ticket[selectedIndexes[i]];
        for(let i=0;i<outs.length;i++)outs[i]=other[outIndexes[i]];
        const outCount=binom[39*7+outHits];
        for(let a=0;a<selected.length;a+=hits){
          for(let outIndex=0;outIndex<outCount;outIndex++){
            const b=outIndex*outHits;let ai=0,bi=0,rank=0;
            // Combinadic rank of the merged sorted six numbers, in [0, C(45,6)).
            for(let pos=1;pos<=6;pos++){
              const n=bi>=outHits||(ai<hits&&selected[a+ai]<outs[b+bi]) ? selected[a+ai++] : outs[b+bi++];
              rank+=binom[(n-1)*7+pos];
            }
            const word=rank>>>5,mask=1<<(rank&31);
            if(!(bits[word]&mask)){bits[word]|=mask;added++;}
          }
        }
      }
      return added;
    }
    const baseBits=new Uint32Array(WORDS);let baselineFavorable=0,scratch=null;
    for(const row of saved.values())baselineFavorable+=addTicket(baseBits,row);
    const baseline=Object.freeze(result(baselineFavorable,saved.size));
    function evaluate(newTickets){
      const incoming=normalize(newTickets),additions=[];
      for(const [key,row] of incoming)if(!saved.has(key))additions.push(row);
      const uniqueGames=saved.size+additions.length;
      if(uniqueGames>MAX_GAMES)throw new Error('저장 조합과 추가 조합을 합쳐 서로 다른 조합 200게임까지 정확하게 계산할 수 있습니다.');
      let newFavorable=0;
      if(additions.length){
        if(!scratch)scratch=new Uint32Array(WORDS);
        scratch.set(baseBits);
        for(const row of additions)newFavorable+=addTicket(scratch,row);
      }
      return {...result(baselineFavorable+newFavorable,uniqueGames),
        baselineGames:saved.size,addedUnique:additions.length,newFavorable};
    }
    return Object.freeze({baseline,evaluate});
  }
  function coverageExact(tickets){return createContext(tickets).baseline;}
  const api=Object.freeze({TOTAL:8145060,ONE:194130,MAX_GAMES:200,createContext,coverageExact});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LottoCoverage=api;
})(typeof window!=='undefined'?window:globalThis);
