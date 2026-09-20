(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const C=window.LottoCore,P=window.LottoPortfolio,S=window.LottoSplit;
  const source = window.LOTTO_DATA;
  const templates=window.LOTTO_PORTFOLIO;
  const splitModel=S&&window.LOTTO_SPLIT?.model?window.LOTTO_SPLIT:null;
  const draws=source.draws.slice().sort((a,b)=>a.round-b.round);
  const fmt=n=>n.toLocaleString('ko-KR');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storageKey='lotto-atelier-645.v1';
  const defaultTargetRound=Math.max(source.metadata.lastRound+1,window.LottoRound?window.LottoRound.upcoming(Date.now()):0);
  const pastWinners=new Set(draws.map(d=>C.key(d.numbers)));
  const SEARCH=300; // 같은 배치의 번호 치환 후보 수. 어느 후보든 당첨 확률은 같다.
  let current=null,saved=[],storageIssue='',activeCheck=null,toastTimer;
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
  function formatChance(jackpot){
    const percent=(jackpot.probability*100).toFixed(8),reciprocal=jackpot.unique?jackpot.total/jackpot.unique:null;
    const reciprocalText=reciprocal===null?'고유 조합을 추가하면 표시됩니다.':(Number.isInteger(reciprocal)?'':'약 ')+fmt(Math.round(reciprocal))+'분의 1';
    return {percent,reciprocalText};
  }
  function ticketRow(numbers,index,small=false,check=false){
    const marks=n=>check&&activeCheck?(activeCheck.numbers.includes(n)?'match':activeCheck.bonus===n?'bonus':''):'';
    return '<div class="ticket-row"><span class="row-letter">'+String.fromCharCode(65+index)+'</span><div class="balls" aria-label="'+numbers.join(', ')+'">'+numbers.map(n=>ball(n,small,marks(n))).join('')+'</div></div>';
  }
  function renderCurrent(){
    const games=current?.games||[];
    $('tickets').innerHTML=games.map((n,i)=>ticketRow(n,i,false,true)).join('');
    ['save','copy','csv'].forEach(id=>$(id).disabled=!games.length);
    if(!current)return;
    const profile=current.profile,m=games.length,p=profile.probabilities[3],diff=(p.probability-p.randomBaseline)*100;
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
    renderSplit();
    if(activeCheck)renderCheck();
  }
  function renderSplit(){
    const split=splitModel&&current?S.assess(current.games,splitModel,pastWinners):null;
    $('split-card').hidden=!split;if(!split)return;
    const signed=v=>(v>=1?'+':'−')+Math.abs((v-1)*100).toFixed(0)+'%';
    $('split-payout').textContent=signed(split.payout);
    $('split-range').textContent='추정 범위 '+signed(split.payoutLow)+' ~ '+signed(split.payoutHigh);
    const warnings=split.flags.map((flag,i)=>flag?String.fromCharCode(65+i)+' '+flag:'').filter(Boolean);
    $('split-note').textContent='공동 1등 예상 인원이 평균적인 조합의 '+split.crowd.toFixed(2)+'배입니다. '+(warnings.length?'손으로 많이 고르는 모양: '+warnings.join(', ')+'. ':'손으로 많이 고르는 모양은 없습니다. ')+'1등 확률은 어떤 번호든 같습니다.';
  }
  function generate(){
    $('form-error').hidden=true;
    try{
      const amount=Number($('amount').value),targetRound=selectedRound();
      const blocked=new Set(saved.filter(batch=>batch.targetRound===targetRound).flatMap(batch=>batch.games.map(C.key)));
      const avoid=Boolean(splitModel&&$('avoid-popular').checked);
      let result=null,best=null;
      for(let attempt=0;attempt<(avoid?SEARCH:200);attempt++){
        const candidate=P.generate(templates,amount);
        if(candidate.numbers.some(numbers=>blocked.has(C.key(numbers))))continue;
        if(!avoid){result=candidate;break;}
        const split=S.assess(candidate.numbers,splitModel,pastWinners);
        if(S.better(split,best)){best=split;result=candidate;}
      }
      if(result&&best?.flagged){const repaired=S.repair(result.numbers,splitModel,pastWinners,C.randomInt,numbers=>blocked.has(C.key(numbers)));result={...result,numbers:repaired.numbers,profile:P.analyze(repaired.numbers)};}
      if(!result)throw new Error('보관함과 겹치지 않는 새 배치를 만들지 못했습니다. 다시 시도해 주세요.');
      current={id:globalThis.crypto?.randomUUID?.()||Date.now()+'-'+C.randomInt(1000000),createdAt:new Date().toISOString(),targetRound,label:(amount<=7?'번호 비중복 배치':'게임 간 겹침 최대 1개 배치')+(avoid?' · 인기 번호대 회피':''),method:result.method,model:null,options:{avoidPopular:avoid},games:result.numbers,profile:result.profile};
      activeCheck=null;$('check-results').innerHTML='';$('check-message').textContent='과거 대조는 다음 회차 예측 성적이 아닙니다.';$('check-message').classList.remove('error-text');
      $('cost').textContent=fmt(amount*1000)+'원';$('generate').textContent='새 번호 '+amount+'게임 만들기';
      $('method-note').textContent=(amount<=7?'게임끼리 같은 번호를 쓰지 않도록 구성합니다.':'45개 번호를 고르게 사용하고, 두 게임의 공통 번호는 최대 1개로 제한합니다.')+' '+targetRound+'회 보관함의 기존 조합은 제외합니다.'+(avoid?' 같은 확률의 후보 '+SEARCH+'개 중 공동 당첨자가 가장 적을 것으로 추정되는 묶음을 골랐습니다.':'');
      renderCurrent();return true;
    }catch(error){$('form-error').textContent=error.message;$('form-error').hidden=false;return false;}
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
    const count=saved.reduce((n,b)=>n+b.games.length,0);$('saved-count').textContent=fmt(count);$('export-all').disabled=!count;
    $('saved-list').innerHTML=(storageIssue?'<p class="backup-notice">'+escape(storageIssue)+'</p>':'')+(saved.length?saved.map(batch=>'<section class="saved-batch"><div class="saved-heading"><div><h3>'+(batch.targetRound?escape(batch.targetRound+'회'):'회차 미지정')+' · '+batch.games.length+'게임</h3><p>'+escape(time(batch.createdAt))+' · '+escape(batch.label)+'</p></div><div class="saved-actions"><button class="secondary-button" data-export="'+escape(batch.id)+'">CSV</button><button class="secondary-button" data-delete="'+escape(batch.id)+'">삭제</button></div></div>'+batch.games.map((n,i)=>ticketRow(n,i,true)).join('')+'</section>').join(''):'<p class="empty-state">보관한 번호가 없습니다. 현재 묶음에서 ‘보관함에 저장’을 눌러 주세요.</p>');
  }
  function saveCurrent(){
    if(!current)return;
    if(saved.some(b=>b.id===current.id)){toast('이미 보관한 묶음입니다.');return;}
    if(persist([structuredClone(current),...saved])){renderSaved();renderCurrent();toast(current.targetRound+'회에 현재 '+current.games.length+'게임을 보관했습니다.');}
  }
  function selectDraw(){
    activeCheck=null;$('check-results').innerHTML='';$('check-message').textContent='과거 대조는 다음 회차 예측 성적이 아닙니다.';$('check-message').classList.remove('error-text');
    const draw=draws.find(d=>String(d.round)===$('draw-select').value);
    $('winning-input').value=draw?draw.numbers.join(' '):'';$('bonus-input').value=draw?draw.bonus:'';
    renderCurrent();
  }
  function renderCheck(){
    if(!current||!activeCheck)return;
    $('check-results').innerHTML=current.games.map((n,i)=>{const match=C.match(n,activeCheck.numbers,activeCheck.bonus);return '<div class="check-result '+(match.hits>=3?'win':'')+'"><strong>'+String.fromCharCode(65+i)+'</strong>'+match.hits+'개 일치 · '+match.label+'</div>';}).join('');
    $('check-message').textContent=activeCheck.label+'와 현재 묶음을 대조했습니다. 실선 테두리는 본번호, 점선은 보너스 일치입니다. 다음 회차 예측 성적이 아닙니다.';
  }
  function checkNumbers(){
    try{
      const tokens=$('winning-input').value.trim().split(/[\s,]+/);
      if(tokens.length!==6||tokens.some(t=>!/^\d{1,2}$/.test(t)))throw new Error('본번호 6개를 공백이나 쉼표로 구분해 입력해 주세요.');
      const numbers=tokens.map(Number),raw=$('bonus-input').value.trim(),bonus=raw===''?null:Number(raw);
      C.match(numbers,numbers,bonus);
      activeCheck={numbers,bonus,label:$('draw-select').value==='manual'?'직접 입력한 당첨번호':'공식 '+$('draw-select').value+'회'};
      $('check-message').classList.remove('error-text');renderCurrent();
    }catch(error){activeCheck=null;renderCurrent();$('check-results').innerHTML='';$('check-message').textContent=error.message;$('check-message').classList.add('error-text');}
  }
  $('target-round').value=String(defaultTargetRound);
  $('amount').innerHTML=Array.from({length:20},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'게임</option>').join('');$('amount').value='5';
  $('target-round').addEventListener('change',generate);
  $('amount').addEventListener('change',generate);
  $('avoid-popular').addEventListener('change',generate);
  $('generate').addEventListener('click',()=>{if(generate())toast('새 번호 '+current.games.length+'게임을 만들었습니다.');});
  $('save').addEventListener('click',saveCurrent);$('copy').addEventListener('click',copyNumbers);$('csv').addEventListener('click',()=>current&&exportCSV([current]));$('export-all').addEventListener('click',()=>exportCSV(saved));
  $('saved-list').addEventListener('click',event=>{
    const exportButton=event.target.closest('[data-export]'),deleteButton=event.target.closest('[data-delete]');
    if(exportButton){const batch=saved.find(b=>b.id===exportButton.dataset.export);if(batch)exportCSV([batch]);}
    if(deleteButton){const batch=saved.find(b=>b.id===deleteButton.dataset.delete);if(batch&&window.confirm('이 묶음의 '+batch.games.length+'게임을 보관함에서 삭제할까요?')&&persist(saved.filter(b=>b.id!==batch.id))){renderSaved();renderCurrent();toast('묶음을 삭제했습니다.');}}
  });
  $('draw-select').innerHTML='<option value="manual">당첨번호 직접 입력</option>'+[...draws].reverse().map(d=>'<option value="'+d.round+'">'+d.round+'회 · '+d.date+'</option>').join('');
  $('draw-select').value='manual';
  $('data-note').textContent='보관된 공식 자료: '+source.metadata.firstRound+'~'+source.metadata.lastRound+'회 · '+source.metadata.lastDrawDate+'까지. 매주 추첨 후 자동으로 추가되며, 아직 없는 회차는 직접 입력해 주세요.';
  $('draw-select').addEventListener('change',selectDraw);$('check').addEventListener('click',checkNumbers);
  ['winning-input','bonus-input'].forEach(id=>$(id).addEventListener('input',()=>{$('draw-select').value='manual';activeCheck=null;$('check-results').innerHTML='';$('check-message').textContent='번호를 확인한 뒤 현재 번호 대조를 눌러 주세요.';$('check-message').classList.remove('error-text');renderCurrent();}));
  window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null){saved=[];storageIssue='';loadSaved();renderSaved();renderCurrent();}});
  loadSaved();renderSaved();generate();if(storageIssue)toast(storageIssue,true);
  if(document.modelContext?.registerTool){
    const lifecycle=new AbortController();
    const actions=[{name:'read_lotto_collection',title:'현재 로또 조합 확인',description:'현재 번호와 선택 회차 전체의 정확한 1등 확률, 보관 게임 수를 읽습니다.',annotations:{readOnlyHint:true},run:()=>({current,roundCoverage:coverageForRound(selectedRound()),savedGames:saved.reduce((n,b)=>n+b.games.length,0),forecastAdvantage:false})},
      {name:'generate_lotto_numbers',title:'설정한 게임 수로 조합 생성',description:'화면에 선택한 게임 수로 겹침을 줄인 새 번호를 생성합니다. 저장하거나 구매하지 않습니다.',annotations:{readOnlyHint:false},run:()=>{if(!generate())throw new Error($('form-error').textContent);return current;}}];
    for(const action of actions){try{Promise.resolve(document.modelContext.registerTool({name:action.name,title:action.title,description:action.description,annotations:action.annotations,inputSchema:{type:'object',properties:{},additionalProperties:false},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('빈 객체를 입력해 주세요. 게임 수는 화면에서 선택합니다.');return action.run();}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
  // 오프라인 지원(sw.js). 파일로 직접 연 단일 HTML에서는 등록할 수 없으므로 웹 주소에서만 켠다.
  if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
