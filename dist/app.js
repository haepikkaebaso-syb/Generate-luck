(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const C=window.LottoCore,P=window.LottoPortfolio,E=window.LottoExtension,G=window.LottoGeneration;
  const source = window.LOTTO_DATA;
  const templates=window.LOTTO_PORTFOLIO;
  const draws=source.draws.slice().sort((a,b)=>a.round-b.round);
  const fmt=n=>n.toLocaleString('ko-KR');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storageKey='lotto-atelier-645.v1';
  const defaultTargetRound=Math.max(source.metadata.lastRound+1,window.LottoRound?window.LottoRound.upcoming(Date.now()):0);
  let current=null,saved=[],storageIssue='',toastTimer;
  let generationBusy=false,generationSequence=0,generationJob=null,coverageJob=null,coveragePending='',coverageFailed='',resumeGeneration=false;
  const coverageCache=new Map();
  const coverageKey=rows=>[...new Set(rows.map(C.key))].sort().join('|');
  const canWork=()=>G&&typeof window.Worker==='function'&&typeof window.LOTTO_WORKER_SOURCE==='string';
  function background(message){
    const url=URL.createObjectURL(new Blob([window.LOTTO_WORKER_SOURCE],{type:'text/javascript'}));
    let worker,timer,settled=false,rejectJob;
    const finish=()=>{clearTimeout(timer);worker?.terminate();URL.revokeObjectURL(url);};
    const promise=new Promise((resolve,reject)=>{
      rejectJob=reject;
      try{
        worker=new window.Worker(url);
        worker.onmessage=event=>{if(settled)return;settled=true;finish();event.data.ok?resolve(event.data.result):reject(new Error(event.data.error||'계산하지 못했습니다.'));};
        worker.onerror=()=>{if(settled)return;settled=true;finish();reject(new Error('계산을 완료하지 못했습니다. 다시 만들어 주세요.'));};
        timer=setTimeout(()=>{if(settled)return;settled=true;finish();reject(new Error('계산 시간이 길어 중단했습니다. 다시 만들어 주세요.'));},60000);
        worker.postMessage(message);
      }catch(error){settled=true;finish();reject(error);}
    });
    return {promise,cancel(){if(settled)return;settled=true;finish();rejectJob(new Error('계산 취소'));}};
  }
  function rememberCoverage(key,value){
    coverageCache.set(key,value);if(coverageCache.size>8)coverageCache.delete(coverageCache.keys().next().value);
  }
  function busy(value){
    generationBusy=value;$('generate').disabled=value;
    ['save','copy','csv'].forEach(id=>$(id).disabled=value||!current?.games.length);
    $('generation-status').hidden=!value;
    $('generation-status').textContent=value?'보관 번호와 함께 쓸 추가 번호를 계산하고 있습니다. 계산이 끝나면 번호가 바뀝니다.':'';
  }
  const time=value=>new Date(value).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
  function loadSaved(){
    try{
      const raw=localStorage.getItem(storageKey);if(!raw)return;
      const parsed=JSON.parse(raw);
      if(!Array.isArray(parsed)||parsed.some(b=>!b||typeof b.id!=='string'||typeof b.label!=='string'||!Number.isFinite(Date.parse(b.createdAt))||!Array.isArray(b.games)||!b.games.length||b.games.some(n=>!C.validNumbers(n,6))||(b.targetRound!==undefined&&(!Number.isInteger(b.targetRound)||b.targetRound<1))))throw new Error('invalid');
      saved=parsed;
    }catch{storageIssue='보관함을 읽지 못했습니다. 기존 기록 보호를 위해 저장을 중단했습니다. 현재 번호는 CSV로 받을 수 있습니다.';}
  }
  function persist(next){
    if(storageIssue){toast(storageIssue,true);return false;}
    try{localStorage.setItem(storageKey,JSON.stringify(next));saved=next;return true;}
    catch{toast('브라우저에 저장하지 못했습니다. CSV로 번호를 보관해 주세요.',true);return false;}
  }
  function ball(n,small=false,mark=''){return '<span class="ball c'+Math.ceil(n/10)+(small?' small':'')+(mark?' '+mark:'')+'">'+n+'</span>';}
  function selectedRound(){
    const round=Number($('target-round').value);
    if(!Number.isInteger(round)||round<1)throw new Error('구매할 회차를 1 이상의 정수로 입력해 주세요.');
    return round;
  }
  function coverageForRound(round){
    const savedGames=saved.filter(batch=>batch.targetRound===round).flatMap(batch=>batch.games);
    const currentGames=current?.targetRound===round?current.games:[];
    const all=[...savedGames,...currentGames],jackpot=C.jackpotProbability(all);
    return {...jackpot,round,savedGames:savedGames.length,currentGames:currentGames.length,entries:all.length,duplicates:all.length-jackpot.unique};
  }
  function prizeCoverageForRound(round){
    const all=[...saved.filter(batch=>batch.targetRound===round).flatMap(batch=>batch.games),...(current?.targetRound===round?current.games:[])];
    const unique=[...new Map(all.map(numbers=>[C.key(numbers),numbers])).values()];
    try{return P.analyze(unique);}catch{}
    if(!G||!unique.length||unique.length>G.MAX_GAMES)return null;
    const key=coverageKey(unique);
    if(coverageCache.has(key))return coverageCache.get(key);
    if(coveragePending===key||coverageFailed===key)return null;
    if(!canWork()){
      try{const result=G.run({type:'coverage',numbers:unique});rememberCoverage(key,result);return result;}catch{coverageFailed=key;return null;}
    }
    coverageJob?.cancel();coveragePending=key;coverageFailed='';
    const job=coverageJob=background({type:'coverage',numbers:unique});
    job.promise.then(result=>{
      if(coverageJob!==job)return;
      rememberCoverage(key,result);coveragePending='';coverageJob=null;renderCurrent();
    }).catch(()=>{if(coverageJob!==job)return;coveragePending='';coverageFailed=key;coverageJob=null;renderCurrent();});
    return null;
  }
  function formatChance(jackpot){
    const percent=(jackpot.probability*100).toFixed(8),reciprocal=jackpot.unique?jackpot.total/jackpot.unique:null;
    const reciprocalText=reciprocal===null?'고유 조합을 추가하면 표시됩니다.':(Number.isInteger(reciprocal)?'':'약 ')+fmt(Math.round(reciprocal))+'분의 1';
    return {percent,reciprocalText};
  }
  function ticketRow(numbers,index,small=false,draw=null,result=''){
    const marks=n=>draw?(draw.numbers.includes(n)?'match':draw.bonus===n?'bonus':''):'';
    return '<div class="ticket-row"><span class="row-letter">'+String.fromCharCode(65+index)+'</span><div class="balls" aria-label="'+numbers.join(', ')+'">'+numbers.map(n=>ball(n,small,marks(n))).join('')+'</div>'+result+'</div>';
  }
  // 번호는 그 번호를 산 회차의 당첨번호와만 대조한다. 공식 자료가 우선이고, 아직 없는 회차만 직접 입력한 번호를 쓴다.
  const officialDraws=new Map(draws.map(d=>[d.round,d])),manualKey='lotto-atelier-645.manual-draws.v1';
  let manualDraws=new Map();
  function loadManual(){
    try{
      const parsed=JSON.parse(localStorage.getItem(manualKey)||'[]');
      manualDraws=new Map(parsed.filter(d=>d&&Number.isInteger(d.round)&&d.round>0&&C.validNumbers(d.numbers,6)&&C.validNumbers([...d.numbers,d.bonus],7)).map(d=>[d.round,{round:d.round,numbers:d.numbers,bonus:d.bonus,manual:true}]));
    }catch{manualDraws=new Map();}
  }
  const drawFor=round=>officialDraws.get(round)||manualDraws.get(round)||null;
  const drawBalls=draw=>draw.numbers.map(n=>ball(n,true)).join('')+'<span class="plus">+</span>'+ball(draw.bonus,true);
  function gameResult(numbers,draw){
    const m=C.match(numbers,draw.numbers,draw.bonus);
    return '<span class="game-result'+(m.rank?' win':'')+'"><b>'+(m.rank?m.rank+'등':'미당첨')+'</b><small>'+(m.rank===2?'5개+보너스':m.hits+'개 일치')+'</small></span>';
  }
  function checkSaved(round){
    const draw=drawFor(round);if(!draw)return null;
    const games=[...new Map(saved.filter(b=>b.targetRound===round).flatMap(b=>b.games).map(n=>[C.key(n),n])).values()];
    const ranks=[0,0,0,0,0,0];games.forEach(n=>ranks[C.match(n,draw.numbers,draw.bonus).rank]++);
    return {draw,games:games.length,ranks,won:games.length-ranks[0]};
  }
  const rankSummary=result=>result.won?[1,2,3,4,5].filter(r=>result.ranks[r]).map(r=>r+'등 '+result.ranks[r]+'게임').join(' · ')+(result.ranks[0]?' · 미당첨 '+result.ranks[0]+'게임':''):'모두 미당첨';
  function renderResultBanner(){
    // 가장 최근에 추첨된 회차(또는 그 이후 직접 입력한 회차) 중 보관한 번호가 있는 회차
    const round=Math.max(0,...saved.map(b=>b.targetRound).filter(r=>r>=source.metadata.lastRound&&drawFor(r))),result=round?checkSaved(round):null;
    $('result-banner').hidden=!result;if(!result)return;
    $('banner-title').textContent=round+'회 추첨 결과 · 보관한 '+result.games+'게임'+(result.draw.manual?' (직접 입력한 당첨번호)':'');
    $('result-numbers').innerHTML=drawBalls(result.draw);
    $('result-summary').textContent=rankSummary(result);
    $('result-banner').classList.toggle('won',result.won>0);
  }
  function renderCurrent(){
    const games=current?.games||[];
    const currentDraw=current?drawFor(current.targetRound):null;
    $('tickets').innerHTML=games.map((n,i)=>ticketRow(n,i,false,currentDraw,currentDraw?gameResult(n,currentDraw):'')).join('');
    $('current-check').hidden=!currentDraw;
    if(currentDraw)$('current-check').textContent=current.targetRound+'회 '+(currentDraw.manual?'직접 입력한':'공식')+' 당첨번호와 대조한 참고용 결과입니다. 실선 테두리는 본번호, 점선은 보너스 일치입니다.';
    ['save','copy','csv'].forEach(id=>$(id).disabled=generationBusy||!games.length);
    if(!current)return;
    const profile=current.profile,m=games.length,roundProfile=prizeCoverageForRound(current.targetRound);
    const displayProfile=roundProfile||profile,p=displayProfile.probabilities[3],diff=(p.probability-p.randomBaseline)*100;
    $('chance-scope').textContent='본번호 3개 이상 일치 · '+(roundProfile&&roundProfile.games>m?'보관함 + 현재 '+roundProfile.games+'게임':'현재 '+m+'게임');
    $('round-prize-note').textContent=roundProfile&&roundProfile.games>m
      ?'보관 번호를 포함한 회차 전체의 확률입니다. 현재 '+m+'게임만의 확률은 '+(profile.probabilities[3].probability*100).toFixed(4)+'%입니다.'
      :!roundProfile?(coveragePending?'회차 전체 확률을 계산 중입니다. 지금은 현재 묶음만 표시합니다.':G?'회차 전체 계산을 완료하지 못했거나 '+G.MAX_GAMES+'게임을 넘어 현재 묶음만 표시합니다.':'회차 전체에 겹침이 큰 조합이 있거나 20게임을 넘어, 이 카드는 현재 묶음만 계산합니다.'):'';
    $('result-title').textContent=m+'게임의 조합';
    $('generation-time').textContent=time(current.createdAt);$('generation-time').dateTime=current.createdAt;
    $('structure-summary').textContent='사용 번호 '+profile.distinctNumbers+'개 · 게임끼리 겹침 최대 '+profile.maxOverlap+'개';
    $('prize-probability').textContent=(p.probability*100).toFixed(2);
    $('random-probability').textContent=(p.randomBaseline*100).toFixed(2)+'%';
    $('improvement').textContent=Math.abs(diff)<1e-10?'같음':(diff>0?'+':'')+diff.toFixed(2)+'%p';
    $('no-win').textContent=((1-p.probability)*100).toFixed(2)+'%';
    const currentJackpot=C.jackpotProbability(games),roundJackpot=coverageForRound(current.targetRound);
    const {percent,reciprocalText}=formatChance(roundJackpot),currentPercent=(currentJackpot.probability*100).toFixed(8);
    $('jackpot-title').textContent=current.targetRound+'회 전체 '+roundJackpot.unique+'게임의 1등 확률';
    $('jackpot-percent').textContent=percent;
    $('jackpot-reciprocal').textContent=reciprocalText;
    $('jackpot-fraction').textContent=fmt(roundJackpot.unique)+' / '+fmt(roundJackpot.total);
    $('jackpot-coverage').textContent='보관 '+fmt(roundJackpot.savedGames)+'게임 + 현재 '+fmt(roundJackpot.currentGames)+'게임 · 중복 '+fmt(roundJackpot.duplicates)+'개를 제외한 고유 조합 '+fmt(roundJackpot.unique)+'개';
    $('unique-badge').textContent='현재 고유 조합 '+fmt(currentJackpot.unique)+'개';
    $('jackpot-note').textContent='현재 묶음만의 1등 확률은 '+currentPercent+'%입니다. 저장 후 같은 '+current.targetRound+'회 번호를 다시 만들면 보관함과 겹치지 않는 새 조합을 추가합니다.';
    $('jackpot-calculation').textContent=current.targetRound+'회 전체: '+fmt(roundJackpot.unique)+' ÷ '+fmt(roundJackpot.total)+' ≈ '+percent+'% ('+reciprocalText+')';
    const announcement=current.targetRound+'회에 사용할 서로 다른 조합 '+roundJackpot.unique+'개. 1등이 한 번이라도 나올 확률은 약 '+percent+'퍼센트, '+reciprocalText+'입니다.';
    if($('jackpot-status').textContent!==announcement)$('jackpot-status').textContent=announcement;
    const labels={3:'5등 이상 · 본번호 3개 이상',4:'4등 이상 · 본번호 4개 이상',5:'3등 이상 · 본번호 5개 이상',6:'1등 · 본번호 6개'};
    $('probability-table').innerHTML=[6,5,4,3].map(k=>'<tr'+(k===6?' class="jackpot-table-row"':'')+'><th scope="row">'+labels[k]+'</th><td>'+((k===6?currentJackpot.probability:profile.probabilities[k].probability)*100).toFixed(k===6?8:6)+'%</td><td>'+((k===6?currentJackpot.probability:profile.probabilities[k].randomBaseline)*100).toFixed(k===6?8:6)+'%</td></tr>').join('');
    $('method-verdict').textContent='4등 이상 당첨 확률은 같은 '+m+'게임으로 가능한 수학적 상한에 도달합니다. 두 게임이 각각 4개 이상 맞으려면 최소 7개의 당첨번호가 필요하므로, 현재 배치에서는 두 게임의 4등 이상 당첨 경우가 겹치지 않기 때문입니다. 5등 이상 확률은 별도의 정확한 합집합 계산으로 표시합니다.';
  }
  function generate(){
    const sequence=++generationSequence;generationJob?.cancel();generationJob=null;coverageJob?.cancel();coverageJob=null;coveragePending='';coverageFailed='';busy(false);
    $('form-error').hidden=true;
    try{
      const amount=Number($('amount').value),targetRound=selectedRound();
      $('cost').textContent=fmt(amount*1000)+'원';
      $('generate').textContent='새 번호 '+amount+'게임 만들기';
      const savedRows=[...new Map(saved.filter(batch=>batch.targetRound===targetRound).flatMap(batch=>batch.games).map(numbers=>[C.key(numbers),numbers])).values()];
      const blocked=new Set(savedRows.map(C.key));
      function accept(result){
        if(sequence!==generationSequence)return false;
        if(!result||result.numbers.length!==amount||result.numbers.some(row=>blocked.has(C.key(row))))throw new Error('보관함과 겹치지 않는 새 배치를 만들지 못했습니다. 다시 시도해 주세요.');
        if(result.roundProfile)rememberCoverage(coverageKey([...savedRows,...result.numbers]),result.roundProfile);
        current={id:globalThis.crypto?.randomUUID?.()||Date.now()+'-'+C.randomInt(1000000),createdAt:new Date().toISOString(),targetRound,label:savedRows.length?'보관 번호 유지 · 추가 구성':amount<=7?'번호 비중복 배치':'게임 간 겹침 최대 1개 배치',method:result.method,extension:result.extension||null,model:null,games:result.numbers,profile:result.profile};
        busy(false);$('cost').textContent=fmt(amount*1000)+'원';$('generate').textContent='새 번호 '+amount+'게임 만들기';
        $('method-note').textContent=(result.extension?.reason||(amount<=7?'게임끼리 같은 번호를 쓰지 않도록 구성합니다.':'45개 번호를 고르게 사용하고, 두 게임의 공통 번호는 최대 1개로 제한합니다.'))+' '+targetRound+'회 보관함의 기존 조합은 제외합니다.';
        renderCurrent();return true;
      }
      if(savedRows.length&&canWork()){
        busy(true);const job=generationJob=background({type:'generate',templates,saved:savedRows,amount});
        return job.promise.then(result=>{if(sequence!==generationSequence)return false;generationJob=null;return accept(result);}).catch(error=>{
          if(sequence!==generationSequence)return false;generationJob=null;busy(false);$('form-error').textContent=error.message;$('form-error').hidden=false;return false;
        });
      }
      if(G)return accept(G.generate(templates,savedRows,amount));
      let result=null;
      if(savedRows.length&&E){
        // 보관 번호에 맞춘 후보는 전체의 5등 이상 당첨 범위만 비교한다.
        for(let attempt=0;attempt<8;attempt++){
          const candidate=E.extend(templates,savedRows,amount);
          const value=candidate.roundProfile?.probabilities[3].favorable??-1;
          const previous=result?.roundProfile?.probabilities[3].favorable??-1;
          if(!result||value>previous)result=candidate;
        }
      }else for(let attempt=0;attempt<200;attempt++){
        const candidate=P.generate(templates,amount);
        if(candidate.numbers.some(numbers=>blocked.has(C.key(numbers))))continue;
        result=candidate;break;
      }
      if(!result)throw new Error('보관함과 겹치지 않는 새 배치를 만들지 못했습니다. 다시 시도해 주세요.');
      return accept(result);
    }catch(error){busy(false);$('form-error').textContent=error.message;$('form-error').hidden=false;return false;}
  }
  function download(content,filename,type){
    const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportCSV(batches){
    const cell=value=>{let v=String(value??'');if(/^[=+@\-\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};
    const rows=[['구매 회차','생성 시각','구성 방법','게임','번호1','번호2','번호3','번호4','번호5','번호6']];
    batches.forEach(b=>b.games.forEach((numbers,i)=>rows.push([b.targetRound||'미지정',time(b.createdAt),b.label,String.fromCharCode(65+i),...numbers])));
    download('\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n'),'로또_번호_'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8');
  }
  async function copyNumbers(){
    if(!current)return;const text=current.games.map((numbers,i)=>String.fromCharCode(65+i)+'  '+numbers.join(' ')).join('\n');
    try{
      if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);toast('번호를 복사했습니다.');return;}catch{}}
      const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();const copied=document.execCommand('copy');input.remove();if(!copied)throw new Error('copy');toast('번호를 복사했습니다.');
    }catch{toast('복사하지 못했습니다. CSV 받기를 이용해 주세요.',true);}
  }
  function renderSaved(){
    const count=saved.reduce((n,b)=>n+b.games.length,0);$('saved-count').textContent=fmt(count);$('export-all').disabled=!count;renderResultBanner();
    const rounds=[...new Set(saved.map(b=>b.targetRound||0))].sort((a,b)=>b-a);
    $('saved-list').innerHTML=(storageIssue?'<p class="backup-notice">'+escape(storageIssue)+'</p>':'')+(saved.length?rounds.map(round=>roundSection(round,saved.filter(b=>(b.targetRound||0)===round))).join(''):'<p class="empty-state">보관한 번호가 없습니다. 현재 묶음에서 ‘보관함에 저장’을 눌러 주세요.</p>');
  }
  // 한 회차에 여러 번 나눠 산 묶음을 모아, 그 회차 당첨번호를 한 번만 보여 주고 게임마다 결과를 붙인다.
  function roundSection(round,batches){
    const draw=round?drawFor(round):null,result=draw?checkSaved(round):null,games=batches.reduce((n,b)=>n+b.games.length,0);
    const head=!round?'<p class="saved-result pending">구매 회차가 기록되지 않아 자동으로 대조할 수 없습니다.</p>'
      :!draw?'<p class="saved-result pending">'+round+'회 당첨번호가 아직 없습니다. 추첨 후 인터넷에 연결된 상태에서 앱을 다시 열면 자동으로 대조합니다.</p>'
      :'<div class="saved-result'+(result.won?' won':'')+'"><span>'+(draw.manual?'직접 입력한 당첨번호':'공식 당첨번호')+'</span><span class="balls">'+drawBalls(draw)+'</span><strong>'+rankSummary(result)+'</strong></div>';
    return '<section class="saved-round"><h3 class="round-title">'+(round?round+'회':'회차 미지정')+' · '+games+'게임</h3>'+head+batches.map((batch,index)=>'<div class="saved-batch"><div class="saved-heading"><div><h4>'+(batches.length-index)+'번째 저장 · '+batch.games.length+'게임</h4><p>'+escape(time(batch.createdAt))+' · '+escape(batch.label)+'</p></div><div class="saved-actions"><button class="secondary-button" data-export="'+escape(batch.id)+'">CSV</button><button class="secondary-button" data-delete="'+escape(batch.id)+'">삭제</button></div></div>'+batch.games.map((n,i)=>ticketRow(n,i,true,draw,draw?gameResult(n,draw):'')).join('')+'</div>').join('')+'</section>';
  }
  function saveCurrent(){
    if(!current||generationBusy)return;
    if(saved.some(b=>b.id===current.id)){toast('이미 보관한 묶음입니다.');return;}
    if(persist([structuredClone(current),...saved])){renderSaved();renderCurrent();toast(current.targetRound+'회에 현재 '+current.games.length+'게임을 보관했습니다.');}
  }
  // 자동 갱신이 아직 안 된 회차(오프라인 등)의 당첨번호를 직접 넣는다. 공식 자료가 들어오면 공식 번호가 우선한다.
  function checkNumbers(){
    const message=$('check-message');
    try{
      const round=Number($('manual-round').value);
      if(!Number.isInteger(round)||round<1)throw new Error('회차를 1 이상의 정수로 입력해 주세요.');
      if(officialDraws.has(round))throw new Error(round+'회는 공식 당첨번호가 이미 있어 자동으로 대조됩니다.');
      const tokens=$('winning-input').value.trim().split(/[\s,]+/),raw=$('bonus-input').value.trim();
      if(tokens.length!==6||tokens.some(t=>!/^\d{1,2}$/.test(t)))throw new Error('본번호 6개를 공백이나 쉼표로 구분해 입력해 주세요.');
      if(!/^\d{1,2}$/.test(raw))throw new Error('보너스 번호를 입력해 주세요.');
      const numbers=tokens.map(Number).sort((a,b)=>a-b),bonus=Number(raw);
      C.match(numbers,numbers,bonus);
      manualDraws.set(round,{round,numbers,bonus,manual:true});
      try{localStorage.setItem(manualKey,JSON.stringify([...manualDraws.values()].map(d=>({round:d.round,numbers:d.numbers,bonus:d.bonus}))));}catch{}
      message.textContent=round+'회 당첨번호로 대조했습니다. 공식 자료가 들어오면 공식 번호로 자동 대체됩니다.';message.classList.remove('error-text');
      renderSaved();renderCurrent();
    }catch(error){message.textContent=error.message;message.classList.add('error-text');}
  }
  $('target-round').value=String(defaultTargetRound);
  $('amount').innerHTML=Array.from({length:20},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'게임</option>').join('');$('amount').value='5';
  $('target-round').addEventListener('change',generate);
  $('amount').addEventListener('change',generate);
  $('generate').addEventListener('click',()=>Promise.resolve(generate()).then(ok=>{if(ok)toast('새 번호 '+current.games.length+'게임을 만들었습니다.');}));
  $('save').addEventListener('click',saveCurrent);$('copy').addEventListener('click',copyNumbers);$('csv').addEventListener('click',()=>current&&exportCSV([current]));$('export-all').addEventListener('click',()=>exportCSV(saved));
  $('saved-list').addEventListener('click',event=>{
    const exportButton=event.target.closest('[data-export]'),deleteButton=event.target.closest('[data-delete]');
    if(exportButton){const batch=saved.find(b=>b.id===exportButton.dataset.export);if(batch)exportCSV([batch]);}
    if(deleteButton){const batch=saved.find(b=>b.id===deleteButton.dataset.delete);if(batch&&window.confirm('이 묶음의 '+batch.games.length+'게임을 보관함에서 삭제할까요?')&&persist(saved.filter(b=>b.id!==batch.id))){renderSaved();if(generationBusy)generate();else renderCurrent();toast('묶음을 삭제했습니다.');}}
  });
  $('manual-round').value=String(source.metadata.lastRound+1);
  const latestDraw=draws.at(-1);
  $('latest-draw-title').textContent='공식 '+latestDraw.round+'회 당첨번호 · '+latestDraw.date;
  $('latest-draw-numbers').textContent=latestDraw.numbers.join(' · ')+' + 보너스 '+latestDraw.bonus;
  $('data-note').textContent='보관된 공식 자료: '+source.metadata.firstRound+'~'+source.metadata.lastRound+'회 · '+source.metadata.lastDrawDate+'까지. 매주 추첨 후 자동으로 추가되며, 그 뒤 회차만 직접 입력할 수 있습니다.';
  $('result-open').addEventListener('click',()=>{$('collection-panel').open=true;$('collection-panel').scrollIntoView?.({behavior:'smooth',block:'start'});});
  $('check').addEventListener('click',checkNumbers);
  ['manual-round','winning-input','bonus-input'].forEach(id=>$(id).addEventListener('input',()=>{$('check-message').textContent='';$('check-message').classList.remove('error-text');renderCurrent();}));
  window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===manualKey||event.key===null){saved=[];storageIssue='';loadSaved();loadManual();renderSaved();if(generationBusy)generate();else renderCurrent();}});
  window.addEventListener('pagehide',()=>{resumeGeneration=generationBusy;generationSequence++;generationJob?.cancel();coverageJob?.cancel();generationJob=null;coverageJob=null;coveragePending='';busy(false);});
  window.addEventListener('pageshow',event=>{if(event.persisted){if(resumeGeneration){resumeGeneration=false;generate();}else renderCurrent();}});
  loadSaved();loadManual();renderSaved();generate();if(storageIssue)toast(storageIssue,true);
  if(document.modelContext?.registerTool){
    const lifecycle=new AbortController();
    const actions=[{name:'read_lotto_collection',title:'현재 로또 조합 확인',description:'현재 번호와 선택 회차 전체의 정확한 1등 확률, 보관 게임 수를 읽습니다.',annotations:{readOnlyHint:true},run:()=>({current,roundCoverage:coverageForRound(selectedRound()),savedGames:saved.reduce((n,b)=>n+b.games.length,0),forecastAdvantage:false})},
      {name:'generate_lotto_numbers',title:'설정한 게임 수로 조합 생성',description:'화면에 선택한 게임 수로 겹침을 줄인 새 번호를 생성합니다. 저장하거나 구매하지 않습니다.',annotations:{readOnlyHint:false},run:async()=>{if(!await generate())throw new Error($('form-error').textContent||'계산이 취소되었습니다.');return current;}}];
    for(const action of actions){try{Promise.resolve(document.modelContext.registerTool({name:action.name,title:action.title,description:action.description,annotations:action.annotations,inputSchema:{type:'object',properties:{},additionalProperties:false},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('빈 객체를 입력해 주세요. 게임 수는 화면에서 선택합니다.');return action.run();}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
  // 설치 앱의 새 버전 확인과 서비스 워커 등록은 update.js에서 처리한다.
})();
