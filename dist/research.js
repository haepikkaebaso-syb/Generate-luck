(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports ? require('./core.js') : root.LottoCore;
  const MODELS=[{id:'uniform',label:'균등 무작위'},{id:'hot52',label:'최근 52회 빈도'},{id:'hot156',label:'최근 156회 빈도'},{id:'cold52',label:'최근 52회 저빈도'},{id:'decay26',label:'최근 흐름 · 반감기 26회'}];
  function fitWeights(history,id){
    if(!MODELS.some(m=>m.id===id))throw new Error('지원하지 않는 분석 모형입니다.');
    if(id==='uniform')return Array(45).fill(1);
    const records=history.slice(-(id==='hot156'||id==='decay26'?156:52));
    const counts=Array(45).fill(20*6/45);let total=20;
    records.forEach((d,i)=>{const w=id==='decay26'?2**(-(records.length-1-i)/26):1;total+=w;d.numbers.forEach(n=>{counts[n-1]+=w;});});
    const rates=counts.map(n=>n/total);
    return (id==='cold52'?rates.map(p=>(6/39)*(1-p)):rates).map(p=>p/(6/45));
  }
  // Product-weight sampling: P(ticket) is proportional to the product of its six weights.
  // Marginals below are computed from this SAME distribution, not confused with raw weights.
  function weightedSpace(weights,fixed=[],excluded=[]){
    if(!Array.isArray(weights)||weights.length!==45||weights.some(w=>!Number.isFinite(w)||w<=0))throw new Error('번호 가중치가 올바르지 않습니다.');
    const valid=C.createSpace({fixed,excluded});
    const pool=Array.from({length:45},(_,i)=>i+1).filter(n=>!fixed.includes(n)&&!excluded.includes(n));
    const k=6-fixed.length,L=pool.length;
    const suffix=Array.from({length:L+1},()=>Array(k+1).fill(0));suffix[L][0]=1;
    for(let i=L-1;i>=0;i--){suffix[i][0]=1;for(let j=1;j<=k;j++)suffix[i][j]=suffix[i+1][j]+weights[pool[i]-1]*suffix[i+1][j-1];}
    function sample(rng){
      const out=[...fixed];let left=k;
      for(let i=0;left&&i<L;i++){
        const p=weights[pool[i]-1]*suffix[i+1][left-1]/suffix[i][left];
        if(rng()<p){out.push(pool[i]);left--;}
      }
      if(left)throw new Error('가중 조합을 완성하지 못했습니다.');
      return out.sort((a,b)=>a-b);
    }
    function marginals(){
      const result=Array(45).fill(0);fixed.forEach(n=>{result[n-1]=1;});
      if(!k)return result;
      const prefix=Array.from({length:L+1},()=>Array(k+1).fill(0));prefix[0][0]=1;
      for(let i=0;i<L;i++){prefix[i+1][0]=1;for(let j=1;j<=k;j++)prefix[i+1][j]=prefix[i][j]+weights[pool[i]-1]*prefix[i][j-1];}
      for(let i=0;i<L;i++){let without=0;for(let j=0;j<k;j++)without+=prefix[i][j]*suffix[i+1][k-1-j];result[pool[i]-1]=weights[pool[i]-1]*without/suffix[0][k];}
      return result;
    }
    return {sample,marginals,total:valid.total,unrank:valid.unrank};
  }
  function randomUnit(){return C.randomInt(4294967296)/4294967296;}
  function generateWeighted(weights,options,amount,blocked=[],rng=randomUnit){
    if(!Number.isInteger(amount)||amount<1||amount>20)throw new Error('한 번에 1~20게임을 생성할 수 있습니다.');
    if(['minSum','maxSum','minOdd','maxOdd'].some(k=>options[k]!==undefined))throw new Error('통계 가중 실험은 고정·제외 번호만 지원합니다. 합계·홀짝은 균형 조건 모드를 이용해 주세요.');
    const space=weightedSpace(weights,options.fixed||[],options.excluded||[]),valid=C.createSpace(options);
    const denied=new Set(blocked.map(C.key));
    const blockedInSpace=new Set(blocked.filter(n=>valid.rankOf(n)>=0).map(C.key)).size;
    const available=space.total-blockedInSpace;
    if(available<amount)throw new Error(`현재 조건에서 생성 가능한 새 조합은 ${available.toLocaleString('ko-KR')}개입니다. 게임 수를 줄이거나 조건을 풀어 주세요.`);
    const numbers=[];
    if(space.total<=2000){
      const candidates=Array.from({length:space.total},(_,i)=>space.unrank(i)).filter(n=>!denied.has(C.key(n)));
      const masses=candidates.map(n=>n.reduce((p,v)=>p*weights[v-1],1));
      for(let t=0;t<amount;t++){
        let target=rng()*masses.reduce((a,b)=>a+b,0),index=masses.length-1;
        for(let i=0;i<masses.length;i++){target-=masses[i];if(target<0){index=i;break;}}
        numbers.push(candidates.splice(index,1)[0]);masses.splice(index,1);
      }
    }else{
      for(let tries=0;numbers.length<amount&&tries<20000;tries++){
        const n=space.sample(rng),key=C.key(n);if(!denied.has(key)){numbers.push(n);denied.add(key);}
      }
      if(numbers.length<amount)throw new Error('현재 가중치와 저장 제외 조건에서 추출이 오래 걸립니다. 조건을 풀거나 무작위 모드를 선택해 주세요.');
    }
    return {numbers,total:space.total,available};
  }
  function generateDiverse(options,amount,blocked=[],rng=C.randomInt){
    const initial=C.generate(options,amount,blocked,rng);
    const fixed=options.fixed||[],excluded=options.excluded||[],pool=Array.from({length:45},(_,i)=>i+1).filter(n=>!excluded.includes(n));
    const denied=new Set(blocked.map(C.key));
    if(!fixed.length&&pool.length>=6*amount&&['minSum','maxSum','minOdd','maxOdd'].every(k=>options[k]===undefined)){
      for(let attempt=0;attempt<40;attempt++){
        const shuffled=[...pool];for(let i=shuffled.length-1;i>0;i--){const j=rng(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
        const numbers=Array.from({length:amount},(_,i)=>shuffled.slice(i*6,i*6+6).sort((a,b)=>a-b));
        if(numbers.every(n=>!denied.has(C.key(n))))return {...initial,numbers,disjoint:true};
      }
    }
    // A bounded overlap-reduction heuristic. Actual prize coverage is computed separately.
    const space=C.createSpace(options),numbers=[];
    for(let i=0;i<amount;i++){
      const candidates=[initial.numbers[i]];
      for(let j=0;j<100;j++)candidates.push(space.unrank(rng(space.total)));
      let best=null,bestScore=Infinity;
      for(const candidate of candidates){
        if(denied.has(C.key(candidate)))continue;
        const score=numbers.reduce((s,t)=>s+candidate.filter(n=>t.includes(n)).length**3,0);
        if(score<bestScore){best=candidate;bestScore=score;}
      }
      if(!best){best=initial.numbers.find(n=>!denied.has(C.key(n)));}
      if(!best)throw new Error('추가 분산 조합을 만들 수 없습니다.');
      numbers.push(best);denied.add(C.key(best));
    }
    return {...initial,numbers,disjoint:new Set(numbers.flat()).size===6*amount};
  }
  function seededRandom(seed){let value=seed>>>0;return ()=>{value+=0x6D2B79F5;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  function coverageExact(input){
    // Standalone to allow direct execution inside an offline Blob Worker.
    const TOTAL=8145060,ONE=194130;
    if(!Array.isArray(input)||input.length>20||input.some(n=>!Array.isArray(n)||n.length!==6||new Set(n).size!==6||n.some(v=>!Number.isInteger(v)||v<1||v>45)))throw new Error('유효한 6개 번호 조합을 최대 20개 입력해 주세요.');
    const tickets=[...new Map(input.map(n=>{const v=[...n].sort((a,b)=>a-b);return [v.join('-'),v];})).values()],m=tickets.length;
    let noWin=1;for(let i=0;i<m;i++)noWin*=(TOTAL-ONE-i)/(TOTAL-i);
    const result=count=>({favorable:count,total:TOTAL,probability:count/TOTAL,uniqueGames:m,randomBaseline:1-noWin,jackpot:m/TOTAL});
    if(!m)return result(0);
    if(new Set(tickets.flat()).size===m*6)return result(m*ONE-m*(m-1)/2*400);
    const binom=Array.from({length:46},()=>Array(7).fill(0));
    for(let n=0;n<=45;n++){binom[n][0]=1;for(let k=1;k<=6;k++)binom[n][k]=n ? (binom[n-1][k]||0)+(binom[n-1][k-1]||0):0;}
    const bits=new Uint8Array(Math.ceil(TOTAL/8));let favorable=0;
    function choose(pool,k){
      const out=[],chosen=[];
      function rec(start,left){if(!left){out.push(chosen.slice());return;}for(let i=start;i<=pool.length-left;i++){chosen.push(pool[i]);rec(i+1,left-1);chosen.pop();}}
      rec(0,k);return out;
    }
    for(const ticket of tickets){
      const other=Array.from({length:45},(_,i)=>i+1).filter(n=>!ticket.includes(n));
      for(let hits=3;hits<=6;hits++){
        const selected=choose(ticket,hits),outs=choose(other,6-hits);
        for(const a of selected)for(const b of outs){
          let ai=0,bi=0,rank=0;
          for(let pos=1;pos<=6;pos++){
            const n=bi>=b.length||(ai<a.length&&a[ai]<b[bi])?a[ai++]:b[bi++];
            rank+=binom[n-1][pos];
          }
          const byte=rank>>>3,mask=1<<(rank&7);
          if(!(bits[byte]&mask)){bits[byte]|=mask;favorable++;}
        }
      }
    }
    return result(favorable);
  }
  const api={MODELS,fitWeights,weightedSpace,generateWeighted,generateDiverse,seededRandom,coverageExact};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LottoResearch=api;
})(typeof window!=='undefined'?window:globalThis);
