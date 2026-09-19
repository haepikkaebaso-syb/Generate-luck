(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.LottoCore;
  const R = window.LottoResearch;
  const A = window.LOTTO_ANALYSIS;
  const V = window.LOTTO_VALIDATION;
  const J = window.LottoJoint;
  const S = window.LOTTO_LAG_ASSOCIATIONS;
  const L = window.LOTTO_LAG_MODELS;
  const modelLabel = id => [...R.MODELS,...L.modelDefinitions].find(m=>m.id===id)?.label || id;
  const source = window.LOTTO_DATA || { metadata: {}, draws: [] };
  const draws = source.draws.filter(d => C.validNumbers(d.numbers, 6)).sort((a,b) => a.round-b.round);
  const fmt = n => n.toLocaleString('ko-KR');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storageKey = 'lotto-atelier-645.v1';
  let saved = [], current = null, fixed = new Set(), excluded = new Set(), mode = 'fixed';
  let toastTimer, storageIssue = '', activeCheck = null, coverageWorker=null, coverageUrl=null;
  const formatTime = value => new Date(value).toLocaleString('ko-KR', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.toggle('error', error);
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
  }
  function loadSaved() {
    try {
      const value = localStorage.getItem(storageKey);
      if (!value) return;
      const data = JSON.parse(value);
      if (!Array.isArray(data) || !data.every(b => b && typeof b.id === 'string' && typeof b.label === 'string' && Number.isFinite(Date.parse(b.createdAt)) && Array.isArray(b.games) && b.games.length > 0 && b.games.every(n=>C.validNumbers(n,6)))) throw new Error('invalid');
      saved = data;
    } catch {
      storageIssue = '저장 기록을 읽을 수 없습니다. 기존 데이터를 보호하기 위해 저장을 중단했습니다. 생성한 번호는 CSV로 받아 주세요.';
    }
  }
  function persist(next) {
    if (storageIssue) { toast(storageIssue,true); return false; }
    try { localStorage.setItem(storageKey,JSON.stringify(next)); saved=next; return true; }
    catch { toast('브라우저에 저장하지 못했습니다. 번호를 CSV로 받아 보관해 주세요.',true); return false; }
  }
  function ball(n,small=false,extra='') {
    return `<span class="ball c${Math.ceil(n/10)}${small ? ' small' : ''}${extra ? ' '+extra : ''}">${n}</span>`;
  }
  function row(numbers,index) {
    const metrics=C.metrics(numbers);
    const matches=activeCheck ? C.match(numbers,activeCheck.numbers,activeCheck.bonus) : null;
    const extra = n => !activeCheck ? '' : activeCheck.numbers.includes(n) ? 'match' : activeCheck.bonus===n ? 'bonus' : '';
    return `<div class="ticket-row" style="animation-delay:${Math.min(index,8)*30}ms"><span class="row-letter">${String.fromCharCode(65+index)}</span><div class="balls" aria-label="${numbers.join(', ')}">${numbers.map(n=>ball(n,false,extra(n))).join('')}</div><div class="row-stats"><span>합계 <b>${metrics.sum}</b></span><span>홀짝 <b>${metrics.odd} : ${6-metrics.odd}</b></span>${matches ? `<span><b>${matches.label}</b></span>`:''}</div></div>`;
  }
  function renderNumbers() {
    $('number-grid').innerHTML = Array.from({length:45},(_,i) => {
      const n=i+1, state=fixed.has(n) ? 'fixed' : excluded.has(n) ? 'excluded' : '';
      const status=state==='fixed' ? '고정됨' : state==='excluded' ? '제외됨' : '미선택';
      return `<button class="number ${state}" data-number="${n}" aria-label="${n}번, ${status}" aria-pressed="${!!state}">${n}</button>`;
    }).join('');
    $('fixed-count').textContent=fixed.size;
    $('excluded-count').textContent=excluded.size;
  }
  function getOptions() {
    const balanced=document.querySelector('[name="method"]:checked').value==='balanced';
    const options={fixed:[...fixed],excluded:[...excluded]};
    if (balanced) {
      for(const [key,id] of [['minSum','min-sum'],['maxSum','max-sum'],['minOdd','min-odd'],['maxOdd','max-odd']]) {
        const value=$(id).value.trim();
        if (!value) throw new Error('균형 조건의 네 가지 범위를 모두 입력해 주세요.');
        options[key]=Number(value);
      }
    }
    return options;
  }
  function getLabel(options) {
    const details=[];
    const method=document.querySelector('[name="method"]:checked').value;
    if(options.minSum!==undefined) details.push(`합계 ${options.minSum}~${options.maxSum}`,`홀수 ${options.minOdd}~${options.maxOdd}개`);
    if(options.fixed.length) details.push(`고정 ${[...options.fixed].sort((a,b)=>a-b).join('·')}`);
    if(options.excluded.length) details.push(`제외 ${options.excluded.length}개`);
    const name=method==='weighted' ? '통계 실험 · '+modelLabel($('model-select').value) : {diverse:'분산 조합',random:'완전 무작위',balanced:'균형 조건'}[method];
    return name+(details.length ? ' · '+details.join(' · ') : '');
  }
  function renderCurrent() {
    const games=current?.games || [];
    $('tickets').innerHTML=games.length ? games.map(row).join('') : '<div class="empty-state"><h3>첫 조합을 만들어 보세요.</h3><p>왼쪽에서 조건을 고르고 번호 생성하기를 눌러 주세요.</p></div>';
    $('unique-count').textContent=`${games.length}게임`;
    $('coverage').textContent=`${new Set(games.flat()).size} / 45`;
    $('result-cost').textContent=`${fmt(games.length*1000)}원`;
    $('generation-time').textContent=current ? formatTime(current.createdAt) : '';
    $('generation-label').textContent=current?.label || '조건 선택 후 생성';
    $('generation-label').title=current?.label || '';
    const p=C.jackpotProbability(games);
    $('probability-text').textContent=p.unique ? `이 ${p.unique}개 조합의 1등 확률은 ${p.unique} / 8,145,060 (약 ${(p.probability*100).toFixed(8)}%)입니다. 5등 이상 범위가 늘어도 1등 확률과 기대 당첨금이 함께 커지는 것은 아닙니다.` : '같은 회차에 구매할 때의 확률을 표시합니다.';
    ['save','copy','csv'].forEach(id => { $(id).disabled=!games.length; });
    if(activeCheck) renderCheckResults();
  }
  function generate() {
    $('form-error').hidden=true;
    try {
      const raw=$('amount').value.trim();
      if(!raw) throw new Error('게임 수를 입력해 주세요.');
      const amount=Number(raw), options=getOptions();
      const blocked=$('avoid-saved').checked ? saved.flatMap(b=>b.games) : [];
      const method=document.querySelector('[name="method"]:checked').value;
      const forecast=L.nextForecast[$('model-select').value];
      const result=method==='diverse'?R.generateDiverse(options,amount,blocked):method==='weighted'?(forecast?.distribution==='mixture'?J.generateMixture(forecast.components,options,amount,blocked):R.generateWeighted(forecast?.weights||R.fitWeights(draws,$('model-select').value),options,amount,blocked)):C.generate(options,amount,blocked);
      current={id:globalThis.crypto?.randomUUID?.() || `${Date.now()}-${C.randomInt(1000000)}`,createdAt:new Date().toISOString(),label:getLabel(options),method,model:method==='weighted'?$('model-select').value:null,dataThrough:source.metadata.lastDrawDate,options,games:result.numbers};
      renderCurrent();
      calculateCoverage();
    } catch(error) {
      $('form-error').textContent=error.message;
      $('form-error').hidden=false;
    }
  }
  function updateCost() {
    const n=Number($('amount').value);
    $('cost').innerHTML=Number.isInteger(n)&&n>=1&&n<=20 ? `${fmt(n*1000)}<span>원</span>` : '—';
  }
  function switchTab(tab) {
    if(!['generate','analysis','validation','lag','saved'].includes(tab)) return;
    document.querySelectorAll('[data-tab]').forEach(button => {
      const active=button.dataset.tab===tab;
      button.classList.toggle('active',active);
      if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    ['generate','analysis','validation','lag','saved'].forEach(id=>{ $('view-'+id).hidden=id!==tab; });
    if(tab==='analysis') renderStats();
    if(tab==='saved') renderSaved();
  }
  function download(content,filename,type) {
    const url=URL.createObjectURL(new Blob([content],{type}));
    const a=document.createElement('a'); a.href=url; a.download=filename;
    document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function exportCSV(batches) {
    if(!batches.length) return toast('내보낼 조합이 없습니다.');
    const quote=value=>`"${String(value).replace(/"/g,'""')}"`;
    const rows=[['생성일시','묶음','게임','번호1','번호2','번호3','번호4','번호5','번호6','합계','홀수','짝수','생성조건']];
    batches.forEach((batch,b)=>batch.games.forEach((numbers,i)=>{
      const m=C.metrics(numbers);
      rows.push([formatTime(batch.createdAt),b+1,String.fromCharCode(65+i),...numbers,m.sum,m.odd,6-m.odd,batch.label]);
    }));
    download('\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),'로또_번호_'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8');
    toast('엑셀에서 열 수 있는 CSV를 내보냈습니다.');
  }
  async function copyNumbers() {
    if(!current) return;
    const text=current.games.map((n,i)=>`${String.fromCharCode(65+i)}  ${n.map(x=>String(x).padStart(2,'0')).join('  ')}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast('번호를 복사했습니다.'); }
    catch {
      const input=document.createElement('textarea'); input.value=text; input.setAttribute('aria-label','복사할 생성 번호'); input.className='fallback-copy';
      $('tickets').after(input); input.focus(); input.select();
      let copied=false;
      try { copied=document.execCommand('copy'); } catch {}
      if(copied) { input.remove(); toast('번호를 복사했습니다.'); }
      else { toast('선택된 번호를 Ctrl+C로 복사해 주세요.'); input.addEventListener('blur',()=>input.remove(),{once:true}); }
    }
  }
  function saveCurrent() {
    if(!current) return;
    const existing=new Set(saved.flatMap(b=>b.games).map(C.key));
    const games=current.games.filter(n=>!existing.has(C.key(n)));
    if(!games.length) return toast('모두 보관함에 있는 조합입니다.');
    if(persist([{...current,games},...saved])) { renderSaved(); toast(`${games.length}게임을 보관함에 저장했습니다.`); }
  }
  function renderSaved() {
    const count=saved.reduce((n,b)=>n+b.games.length,0);
    $('saved-count').textContent=count;
    $('export-all').disabled=!count;
    $('saved-list').innerHTML=(storageIssue ? `<p class="backup-notice">${escape(storageIssue)}</p>` : '')+(saved.length ? saved.map(batch => `<section class="panel saved-batch"><div class="section-title"><div><h3>${escape(formatTime(batch.createdAt))} <span class="muted">· ${batch.games.length}게임</span></h3><p class="hint">${escape(batch.label)}</p></div><div class="saved-actions"><button class="text-button" data-export="${escape(batch.id)}">CSV</button><button class="text-button" data-delete="${escape(batch.id)}">삭제</button></div></div>${batch.games.map((numbers,i)=>{
      const metrics=C.metrics(numbers);
      return `<div class="ticket-row"><span class="row-letter">${String.fromCharCode(65+i)}</span><div class="balls">${numbers.map(n=>ball(n)).join('')}</div><div class="row-stats"><span>합계 <b>${metrics.sum}</b></span><span>홀짝 <b>${metrics.odd} : ${6-metrics.odd}</b></span></div></div>`;
    }).join('')}</section>`).join('') : '<div class="empty-state"><div class="empty-mark" aria-hidden="true">6/45</div><h3>아직 보관한 번호가 없어요.</h3><p>생성한 조합에서 ‘보관함에 저장’을 누르면 이곳에 모입니다.</p><button class="dark-button" data-tab="generate">번호 만들러 가기</button></div>');
  }
  function setupDraws() {
    $('draw-select').innerHTML='<option value="manual">당첨번호 직접 입력</option>'+[...draws].reverse().map(d=>`<option value="${d.round}">${d.round}회 · ${d.date} (공식 기록)</option>`).join('');
    if(draws.length) { $('draw-select').value=String(draws.at(-1).round); selectDraw(); }
    $('data-description').textContent=`${draws[0].round}~${draws.at(-1).round}회 · ${draws[0].date} ~ ${draws.at(-1).date} · 본번호 ${fmt(draws.length*6)}개 분석`;
    $('data-banner').textContent=`${draws[0].date} ~ ${draws.at(-1).date} · 동행복권 공식 ${fmt(draws.length)}회`;
    $('data-status').textContent=`요청 기간 ${source.metadata.requestedStartDate} ~ ${source.metadata.requestedEndDate} · 실제 추첨 ${draws.length}회 · 누락 ${A.independentValidation.missingDrawCount}회`;
    $('recent-draws').innerHTML=[...draws].reverse().slice(0,10).map(d=>`<div class="draw-row"><strong>${d.round}회</strong><div class="balls" aria-label="${d.numbers.join(', ')}, 보너스 ${d.bonus}">${d.numbers.map(n=>ball(n,true)).join('')}<span class="plus-mark">+</span>${ball(d.bonus,true)}</div></div>`).join('');
  }
  function selectDraw() {
    activeCheck=null;
    $('check-results').innerHTML='';
    $('check-message').textContent='과거 대조 결과는 다음 회차의 예측 성능이 아닙니다.';
    $('check-message').classList.remove('error-text');
    const draw=draws.find(d=>String(d.round)===$('draw-select').value);
    if(draw) {
      $('winning-input').value=draw.numbers.join(' '); $('bonus-input').value=draw.bonus ?? '';
      $('winning-line').innerHTML=draw.numbers.map(n=>ball(n,true)).join('')+`<span>+</span>${draw.bonus ? ball(draw.bonus,true) : ''}<span>공식 ${draw.round}회</span>`;
    } else {
      $('winning-input').value=''; $('bonus-input').value='';
      $('winning-line').innerHTML='<span>공식 당첨번호를 아래에 입력해 주세요.</span>';
    }
    if(current) renderCurrent();
  }
  function checkNumbers() {
    try {
      const tokens=$('winning-input').value.trim().split(/[\s,]+/);
      if(tokens.length!==6 || tokens.some(t=>!/^\d{1,2}$/.test(t))) throw new Error('당첨번호 6개를 공백 또는 쉼표로 구분해 입력해 주세요.');
      const numbers=tokens.map(Number), rawBonus=$('bonus-input').value.trim();
      const bonus=rawBonus==='' ? null : Number(rawBonus);
      if(!C.validNumbers(numbers,6)) throw new Error('당첨번호는 1~45 중 서로 다른 숫자 6개여야 합니다.');
      C.match(numbers,numbers,bonus);
      activeCheck={numbers,bonus,label:$('draw-select').value==='manual' ? '직접 입력한 번호' : `공식 ${$('draw-select').value}회`};
      $('winning-line').innerHTML=numbers.map(n=>ball(n,true)).join('')+(bonus ? `<span>+</span>${ball(bonus,true)}` : '')+`<span>${escape(activeCheck.label)}</span>`;
      $('check-message').classList.remove('error-text');
      renderCurrent();
      if(!current) $('check-message').textContent='먼저 번호를 생성해 주세요.';
    } catch(error) {
      activeCheck=null;
      $('check-results').innerHTML='';
      $('check-message').textContent=error.message;
      $('check-message').classList.add('error-text');
      renderCurrent();
    }
  }
  function renderCheckResults() {
    if(!current||!activeCheck) return;
    $('check-message').textContent=`${activeCheck.label}와 현재 조합을 대조했습니다. 진한 테두리: 본번호 일치 · 점선: 보너스 일치. 다음 회차의 예측 성능이 아닙니다.`;
    $('check-results').innerHTML=current.games.map((numbers,i)=>{
      const m=C.match(numbers,activeCheck.numbers,activeCheck.bonus);
      return `<div class="check-result ${m.rank ? 'win' : ''}"><strong>${String.fromCharCode(65+i)}</strong>${m.hits}개 일치${m.bonusHit ? ' + 보너스' : ''} · ${m.label}</div>`;
    }).join('');
  }
  function renderStats() {
    const limit=Number($('stats-range').value);
    const selected=limit ? draws.slice(-limit) : draws;
    if(!selected.length) return;
    const counts=Array(46).fill(0);
    selected.forEach(d=>d.numbers.forEach(n=>counts[n]++));
    const max=Math.max(...counts.slice(1)), min=Math.min(...counts.slice(1));
    const top=counts.slice(1).map((v,i)=>({n:i+1,v})).filter(x=>x.v===max).map(x=>x.n);
    const least=counts.slice(1).map((v,i)=>({n:i+1,v})).filter(x=>x.v===min).map(x=>x.n);
    const avg=selected.reduce((s,d)=>s+C.metrics(d.numbers).sum,0)/selected.length;
    const summaryNumber=values=>values.slice(0,3).join('·')+(values.length>3 ? '…' : '');
    $('stat-cards').innerHTML=[
      ['분석한 추첨',fmt(selected.length),'회',`${selected[0].round}~${selected.at(-1).round}회`],
      ['가장 많이 나온 번호',summaryNumber(top),'',`${max}회 출현${top.length>1 ? ' · 공동 '+top.length+'개' : ''}`],
      ['가장 적게 나온 번호',summaryNumber(least),'',`${min}회 출현${least.length>1 ? ' · 공동 '+least.length+'개' : ''}`],
      ['본번호 합계 평균',avg.toFixed(1),'',`번호 6개의 합계 평균`]
    ].map(([label,value,unit,detail])=>`<div class="stat-card"><span>${label}</span><strong>${value}<small>${unit}</small></strong><p>${detail}</p></div>`).join('');
    $('frequency-chart').innerHTML=counts.slice(1).map((count,i)=>`<div class="freq-item" aria-label="${i+1}번: ${count}회 출현" title="${i+1}번 · ${count}회 / ${selected.length}회"><span class="freq-value">${count}</span><div class="freq-track" aria-hidden="true"><div class="freq-bar" style="height:${max ? count/max*100 : 0}%"></div></div><span class="freq-label">${String(i+1).padStart(2,'0')}</span></div>`).join('');
    $('frequency-period').textContent=`${selected[0].date} ~ ${selected.at(-1).date}`;
  }
  function showCoverage(result){
    if(!current)return;
    current.prizeCoverage=result;
    const diff=(result.probability-result.randomBaseline)*100;
    const change=Math.abs(diff)<0.00001?'0.00':`${diff>0?'+':''}${diff.toFixed(2)}`;
    $('portfolio-result').innerHTML=`<div class="portfolio-numbers"><div><span>5등 이상 하나라도</span><strong>${(result.probability*100).toFixed(2)}<small>%</small></strong></div><div><span>무작위 ${result.uniqueGames}게임의 평균</span><b>${(result.randomBaseline*100).toFixed(2)}%</b><p>평균 대비 ${change}%p</p></div></div><div class="probability-track" role="img" aria-label="당첨 확률 ${(result.probability*100).toFixed(2)}퍼센트"><span style="width:${result.probability*100}%"></span></div><div class="coverage-count"><span>당첨되는 추첨 결과 ${fmt(result.favorable)}개 / ${fmt(result.total)}개</span><span>전부 미당첨 ${(100-result.probability*100).toFixed(2)}%</span></div>`;
  }
  function calculateCoverage(){
    if(coverageWorker){coverageWorker.terminate();coverageWorker=null;}
    if(coverageUrl){URL.revokeObjectURL(coverageUrl);coverageUrl=null;}
    if(!current)return;
    const id=current.id,games=current.games;
    $('portfolio-result').innerHTML='<p class="hint">이 조합들이 당첨되는 추첨 결과의 합집합을 계산하고 있습니다…</p>';
    const finish=result=>{if(current?.id!==id)return;showCoverage(result);if(coverageWorker){coverageWorker.terminate();coverageWorker=null;}if(coverageUrl){URL.revokeObjectURL(coverageUrl);coverageUrl=null;}};
    const fallback=()=>{setTimeout(()=>{if(current?.id!==id)return;try{finish(R.coverageExact(games));}catch{$('portfolio-result').textContent='확률 계산을 완료하지 못했습니다. 번호를 다시 생성해 주세요.';}},0);};
    if(new Set(games.flat()).size===6*games.length){finish(R.coverageExact(games));return;}
    if(typeof Worker==='undefined'){fallback();return;}
    try{
      const script=`const calculate=${R.coverageExact.toString()};self.onmessage=e=>{try{self.postMessage({result:calculate(e.data)});}catch(error){self.postMessage({error:error.message});}};`;
      coverageUrl=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));coverageWorker=new Worker(coverageUrl);
      coverageWorker.onmessage=e=>{if(e.data.error)fallback();else finish(e.data.result);};coverageWorker.onerror=fallback;coverageWorker.postMessage(games);
    }catch{fallback();}
  }
  function table(headers,rows){return `<table class="research-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${cell}</th>`:`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
  function distribution(target,rows,label){
    const max=Math.max(...rows.flatMap(r=>[r.proportion,r.theoreticalProbability]));
    $(target).innerHTML='<div class="distribution-legend"><span><i></i>실제 기록</span><span><i></i>무작위 이론</span></div>'+rows.map(r=>`<div class="distribution-row"><strong>${label(r)}</strong><div class="distribution-bars"><div style="width:${r.proportion/max*100}%"></div><div style="width:${r.theoreticalProbability/max*100}%"></div></div><span>${r.count}회<small>${(r.proportion*100).toFixed(1)}% / 이론 ${(r.theoreticalProbability*100).toFixed(1)}%</small></span></div>`).join('');
  }
  function renderNumberDetails(){
    const sort=$('number-sort').value;
    const records=[...A.numberFrequency].sort((a,b)=>sort==='number'?a.number-b.number:b[sort]-a[sort]||a.number-b.number);
    $('number-details').innerHTML=table(['번호','10년 출현','기대 횟수','최근 52회','최근 156회','현재 공백','최장 완결 공백','보너스 출현','45개 비교 보정 p'],records.map(n=>[ball(n.number,true),`${n.count}회`,n.expectedCount.toFixed(1),`${n.recent52Count}회`,`${n.recent156Count}회`,`${n.currentGap}회`,`${n.maximumCompletedGap}회`,`${n.bonusCountSeparately}회`,n.bonferroni45AdjustedP.toFixed(3)]));
  }
  function updateModelNote(){
    const id=$('model-select').value;
    $('model-note').textContent=id.startsWith('lag_')
      ? `회차 간 연관을 이용한 실험입니다. 재사용한 마지막 104회에서 예측 우세는 확인되지 않았습니다. ${id==='lag_mixture'?'균등·시차 모형 6개의 조합 분포를 같은 비율로 섞습니다. 고정·제외를 넣으면 각 모형에 조건을 적용한 뒤 같은 비율로 섞습니다.':'고정·제외 조건을 넣은 조합에는 기본 모형의 검증 성적을 그대로 적용할 수 없습니다.'}`
      : '과거 가중치를 적용하는 실험입니다. 마지막 104회 검증에서 무작위보다 유리하다는 근거는 확인되지 않았습니다.';
  }
  function renderLagRules(){
    const kind=$('lag-rule-kind').value,lag=Number($('lag-rule-lag').value);
    const group=S.topRulesByLag.find(r=>r.lag===lag);
    const records=group?[...group[kind+'Positive'],...group[kind+'Negative']]:kind==='pair'?S.topPositiveRules:[...S.topSinglePositiveRules,...S.topNegativeRules];
    $('lag-rules').innerHTML=table(['이전 조건','몇 회 뒤','후속 번호','조건 관측','후속 출현','과거 조건부 비율','해당 목표 구간 빈도','전체 검색 보정 p'],records.map(r=>[
      r.antecedent.join(' · '),`${r.lag}회`,r.target,`${r.support}회`,`${r.hits}회`,`${(r.conditionalRate*100).toFixed(1)}%`,`${(r.backgroundRate*100).toFixed(1)}%`,r.familywisePermutationP.toFixed(3)
    ]));
  }
  function exportNextExperiment(){
    const payload={
      schemaVersion:1,createdAt:new Date().toISOString(),targetRound:draws.at(-1).round+1,
      sourceLastRound:draws.at(-1).round,sourceLastDate:draws.at(-1).date,dataSha256:L.metadata.dataSha256,
      modelCodeSha256:L.metadata.codeSha256,modelDefinitions:L.modelDefinitions,
      primaryExperimentalModel:'lag_mixture',baseline:'uniform',pastDevelopmentSelectedModel:L.selection.selectedModel,
      selectionNote:'Equal mixture is a proposed future experiment; the reused historical experiment selected uniform. No predictive advantage established.',
      options:{fixed:[],excluded:[]},forecasts:L.nextForecast,
      evaluation:{metric:'log(P_model(actual six-number set)) + log(8145060)',higherIsBetter:true,baseline:0,noActualDrawIncluded:true},
      limitations:['Local export can be edited and has no trusted timestamp. Export alone does not establish preregistration before a draw.','This frozen distribution applies only to targetRound; subsequent draws require retraining using the same fixed specification.','No automatic data update or future result tracking.','Model probabilities are experimental predictions, not established real-world winning probabilities.']
    };
    download(JSON.stringify(payload,null,2),`로또_${payload.targetRound}회_실험계획.json`,'application/json;charset=utf-8');
  }
  function setupLag(){
    const g=S.globalAssociationTest,full=S.fullSixPattern,percent=p=>(p*100).toFixed(4)+'%';
    $('lag-verdict').innerHTML=`<p class="eyebrow">RESULT · ${S.source.firstRound}–${S.source.lastRound}</p><h3>회차 간 예측 신호는 아직 확인되지 않았습니다.</h3><p>번호와 번호 쌍이 이후 번호와 연결되는 ${fmt(S.method.ruleCount)}개 관계를 조사했습니다. 가장 강한 관계도 전체 검색을 보정한 p=${g.familywisePermutationP.toFixed(3)}입니다. 균등 기준을 포함한 7개 예측 모형 중 앞선 선택 구간에서 가장 좋았던 모형은 균등 모형입니다.</p><p class="hint">이 결과가 모든 형태의 의존성이 없다는 증명은 아닙니다. 검사한 관계와 모형에서 미래 예측의 근거를 확보하지 못했다는 뜻입니다.</p>`;
    $('lag-summary-cards').innerHTML=[['비교한 회차 간격','12','1~10 · 20 · 52회 뒤'],['조사한 조건부 관계',fmt(S.method.ruleCount),'단일 번호 및 번호 쌍 → 한 번호'],['순서를 섞은 비교','999','매번 전체 검색의 최대값과 비교'],['같은 여섯 번호 재등장','0회',`${draws.length}개 조합 모두 서로 다름`]].map(([label,value,detail])=>`<div class="stat-card"><span>${label}</span><strong>${value}</strong><p>${detail}</p></div>`).join('');
    $('lag-overlap').innerHTML=table(['회차 간격','비교한 회차 쌍','같은 번호 평균','독립 추첨 기대값','단독 p','12개 간격 보정 p'],S.lagOverlap.map(r=>[`${r.lag}회 뒤`,r.transitions,r.meanSharedNumbers.toFixed(3),'0.800',r.permutationPUnadjusted.toFixed(3),r.permutationPAdjusted12Lags.toFixed(3)]));
    $('lag-rule-lag').innerHTML='<option value="0">전체 간격의 주요 사례</option>'+S.method.lags.map(n=>`<option value="${n}">${n}회 뒤</option>`).join('');
    ['lag-rule-kind','lag-rule-lag'].forEach(id=>$(id).addEventListener('change',renderLagRules));renderLagRules();
    $('lag-support').innerHTML=`<article><h3>${fmt(full.possibleCombinations)}가지 중 ${draws.length}가지 관측</h3><p>전체 조합의 ${percent(full.historyCoverage)}를 한 번씩 관측했습니다. 동일한 여섯 번호가 나왔던 여러 사례를 모아 다음 결과를 비교할 표본이 없습니다.</p></article><article><h3>조건이 구체적일수록 표본이 줄어듭니다.</h3><p>가능한 번호 쌍마다 평균 ${S.patternRecurrence[1].meanSupportAcrossAllPossible.toFixed(2)}회, 세 번호 묶음마다 평균 ${S.patternRecurrence[2].meanSupportAcrossAllPossible.toFixed(2)}회 관측됐습니다. 미관측 조합을 포함한 평균이며 시차를 적용하면 후속 관측은 더 적어집니다.</p></article><article><h3>83.3%라는 과거 비율을 읽는 방법</h3><p>25·45가 함께 나온 뒤 10회 후 5번이 나온 사례는 6건 중 5건입니다. 하지만 순서를 섞은 ${S.method.permutations}번 중 ${g.permutationExceedances}번에서도 전체 검색 어딘가에 이만큼 극단적인 관계가 나타났습니다. 83.3%를 다음 추첨의 확률로 사용할 수 없습니다.</p></article>`;
    const dev=L.summary.development,hold=L.summary.reusedHistoricalTest;
    $('lag-model-table').innerHTML=table(['모형','선택 262회 점수 ↑','재사용 104회 점수 ↑','104회 보정 구간','판정'],L.modelDefinitions.map(m=>{
      const r=hold[m.id],ci=r.jointLogGainIntervalAdjusted;
      return [escape(m.label)+(m.id===L.selection.selectedModel?'<small class="selected-model">선택 구간 최고 점수</small>':''),dev[m.id].meanJointLogGain.toFixed(6),r.meanJointLogGain.toFixed(6),`${ci.lower.toFixed(6)} ~ ${ci.upper.toFixed(6)}`,m.id==='uniform'?'기준':ci.lower>0?'과거 우세 관찰':ci.upper<0?'과거 점수 더 낮음':'우세 미확인'];
    }));
    $('lag-model-conclusion').textContent='5개 시차 모형과 혼합 모형 모두 재사용 104회 평균 점수가 기준보다 낮았고, 보정 구간은 모두 0을 포함했습니다. 대안 6개에 대한 각 99.1667% 구간은 4회 단위 블록을 4,000번 재표집한 근사값입니다. 이전에 확인한 이 구간을 새로운 독립 시험으로 해석할 수 없습니다.';
    const evaluated=L.perRound.length;
    $('lag-jackpot-context').innerHTML=`<p>공정·독립 추첨에서 한 게임의 1등 확률은 <strong>1 / ${fmt(C.TOTAL)}</strong>입니다. 같은 회차의 서로 다른 5게임은 <strong>5 / ${fmt(C.TOTAL)}</strong>입니다.</p><p>${evaluated}회를 매번 한 게임씩 예측해도 1등이 한 번도 없을 확률은 <strong>${percent(Math.exp(evaluated*Math.log1p(-1/C.TOTAL)))}</strong>, 매번 서로 다른 5게임이면 <strong>${percent(Math.exp(evaluated*Math.log1p(-5/C.TOTAL)))}</strong>입니다. 그래서 1등 적중 횟수와 함께 실제 여섯 번호 전체에 부여한 확률을 평가했습니다.</p><p class="hint">로그 점수는 확률 예측의 평가 지표입니다. 점수가 좋아지더라도 그 수치를 그대로 티켓의 1등 확률 증가율로 읽을 수 없습니다.</p>`;
    $('lag-future-note').textContent=`현재 ${draws.at(-1).round}회까지의 자료로 계산한 ${draws.at(-1).round+1}회용 혼합 실험 분포와 균등 기준을 함께 기록합니다. 다음 추첨 전에 분포를 고정하고, 나온 여섯 번호의 전체 점수를 비교하는 계획입니다. 과거 선택 결과는 균등 모형이며 혼합 실험의 우세는 아직 없습니다. 이후 회차는 새 자료로 다시 계산해야 합니다.`;
    $('export-lag').addEventListener('click',()=>download(JSON.stringify({associations:S,forecasting:L},null,2),'로또_회차간_연관_검증.json','application/json;charset=utf-8'));
    $('export-next-experiment').addEventListener('click',exportNextExperiment);
  }
  function setupResearch(){
    $('model-select').innerHTML='<optgroup label="빈도 기반 실험">'+R.MODELS.filter(m=>m.id!=='uniform').map(m=>`<option value="${m.id}">${m.label}${V.selectedModel===m.id?' · 선택 구간 최소 오차':''}</option>`).join('')+'</optgroup><optgroup label="회차 간 연관 실험 · 예측 우세 미확인">'+L.modelDefinitions.filter(m=>m.id!=='uniform').map(m=>`<option value="${m.id}">${escape(m.label)}</option>`).join('')+'</optgroup>';
    if(V.selectedModel!=='uniform')$('model-select').value=V.selectedModel;
    updateModelNote();
    $('model-select').addEventListener('change',updateModelNote);
    const verdict=V.selectedHoldoutSupportsAdvantage?'선택한 모형에서 회고검증 우세가 관찰됐습니다. 실제 미래 검증은 별도로 필요합니다.':'최종 104회 검증: 무작위보다 높은 예측력은 확인되지 않았습니다.';
    $('generation-verdict').textContent=verdict;
    $('research-conclusion').innerHTML=`<p class="eyebrow">WHAT THE DATA SAYS</p><h3>눈에 띄는 숫자와, 유효한 예측 신호는 다릅니다.</h3><div class="research-facts"><div><strong>12번 · 88회</strong><p>전체 번호의 기대 출현은 각 69.6회.<br>45개를 함께 비교하면 유의한 번호는 ${A.frequencyUniformity.numberTestsSignificantAfterBonferroni45.length}개입니다.</p></div><div><strong>19·21 · 19회</strong><p>가장 많이 함께 나온 번호 쌍.<br>990쌍 비교 보정 p=${A.pairCooccurrence.top15[0].bonferroni990AdjustedP.toFixed(3)}입니다.</p></div><div><strong>전체 빈도 p=${A.frequencyUniformity.asymptoticChiSquaredP.toFixed(3)}</strong><p>비복원 추출을 보정한 근사 검정.<br>균등 추첨과 다른 빈도라는 근거가 부족합니다.</p></div></div><p class="hint">p값은 당첨 확률이 아닙니다. 이 분석은 번호·쌍별 비교를 각각 보정하며, 다른 기간과 패턴 분석은 탐색적 결과입니다.</p>`;
    renderNumberDetails();
    distribution('odd-distribution',A.oddNumberCount.distribution,r=>`${r.value}개`);
    distribution('repeat-distribution',A.previousDrawRepeats.distribution,r=>`${r.value}개`);
    distribution('sum-distribution',A.sum.bins,r=>`${r.from}~${r.to}`);
    $('pattern-summary').innerHTML=`<div class="pattern-metric"><span>연속 번호가 하나 이상 있는 회차</span><strong>${(A.consecutive.observedRate*100).toFixed(2)}%</strong><p>${A.consecutive.drawsWithAtLeastOneConsecutivePair}회 / ${draws.length}회 · 무작위 이론 ${(A.consecutive.theoreticalRate*100).toFixed(2)}%</p></div><div class="pattern-metric"><span>본번호 합계 평균</span><strong>${A.sum.mean.toFixed(2)}</strong><p>무작위 이론 ${A.sum.theoreticalMean} · 실제 표준편차 ${A.sum.sampleStandardDeviation.toFixed(2)}</p></div><div class="pattern-metric"><span>직전 회차와 겹친 번호 평균</span><strong>${A.previousDrawRepeats.observedMeanRepeats.toFixed(3)}개</strong><p>무작위 이론 0.800개 · ${A.previousDrawRepeats.transitionCount}개 회차 전환 분석</p></div><p class="hint">연속수·직전 번호 재등장은 정상적인 무작위 추첨에서도 자주 나타납니다. 이 패턴을 배제하면 유효한 조합도 함께 빠집니다.</p>`;
    const years=A.annualFrequency;
    $('annual-heatmap').innerHTML=table(['번호',...years.map(y=>`${y.year}${y.completeCalendarYear?'':'*'}<small>${y.drawCount}회 추첨</small>`)],A.numberFrequency.map(n=>[n.number,...years.map(y=>`<span class="heat-cell" style="background:rgba(7,102,86,${Math.min(.85,y.counts[n.number-1]/y.drawCount*2.4)});color:${y.counts[n.number-1]/y.drawCount>.2?'white':'#173c32'}" title="${y.year}년 ${n.number}번: ${y.counts[n.number-1]} / ${y.drawCount}회 (${(y.counts[n.number-1]/y.drawCount*100).toFixed(1)}%)">${y.counts[n.number-1]}</span>`)]));
    $('pair-details').innerHTML=table(['번호 쌍','출현','기대','보정 p'],A.pairCooccurrence.top15.map(p=>[p.numbers.join(' · '),`${p.count}회`,p.expectedCount.toFixed(2),p.bonferroni990AdjustedP.toFixed(3)]));
    const selected=V.models.find(m=>m.id===V.selectedModel),dev=selected.development,hold=selected.holdout;
    $('validation-verdict').innerHTML=`<p class="eyebrow">OUT-OF-SAMPLE RESULT</p><h3>${verdict}</h3><p>앞선 ${dev.count}회에서 선택된 모형은 ‘${escape(V.selectedLabel)}’입니다. 마지막 ${hold.count}회에서 기준 대비 오차 개선은 ${hold.improvement.toFixed(6)}, 95% 구간은 ${hold.improvementCI95[0].toFixed(6)} ~ ${hold.improvementCI95[1].toFixed(6)}입니다. ${V.selectedHoldoutSupportsAdvantage?'과거 구간의 우세 관찰은 미래 성과 보장이 아닙니다.':'구간에 0이 포함돼 우세로 판정하지 않습니다.'}</p>`;
    $('validation-timeline').innerHTML=`<div><span>01 · 준비</span><strong>${V.protocol.warmup}회</strong><p>${draws[0].round}~${draws[V.protocol.warmup-1].round}회</p></div><div><span>02 · 모형 선택</span><strong>${dev.count}회</strong><p>${dev.firstRound}~${dev.lastRound}회 · ${dev.firstDate}~${dev.lastDate}</p></div><div><span>03 · 최종 검증</span><strong>${hold.count}회</strong><p>${hold.firstRound}~${hold.lastRound}회 · ${hold.firstDate}~${hold.lastDate}</p></div>`;
    const finiteZero=v=>Math.abs(v)<1e-12?0:v;
    $('validation-table').innerHTML=table(['모형','선택 구간 오차 ↓','최종 구간 오차 ↓','최종 개선량 ↑','보정 구간','판정'],V.models.map(m=>{
      const h=m.holdout,ci=h.improvementCI9875;
      const label=m.id==='uniform'?'기준':ci[0]>0?'회고 우세 관찰':ci[1]<0?'오차 더 큼':'우세 미확인';
      return [escape(m.label)+(m.id===V.selectedModel?'<small class="selected-model">선택 구간에서 결정</small>':''),m.development.brier.toFixed(6),h.brier.toFixed(6),finiteZero(h.improvement).toFixed(6),`${finiteZero(ci[0]).toFixed(6)} ~ ${finiteZero(ci[1]).toFixed(6)}`,label];
    }));
    $('portfolio-validation').innerHTML=table(['5게임 생성 방식','선택 구간','최종 104회','최종 무작위 대비 차이 구간'],V.models.map(m=>[escape(m.label),`${(m.development.anyPrizeRate*100).toFixed(2)}%`,`${(m.holdout.anyPrizeRate*100).toFixed(2)}%`,m.id==='uniform'?'정확한 무작위 평균':`${(m.holdout.anyPrizeVsRandomCI95[0]*100).toFixed(2)} ~ ${(m.holdout.anyPrizeVsRandomCI95[1]*100).toFixed(2)}%p`]).concat([['완전 비중복 분산 조합','11.87%','11.87%','회고 추정 아님 · 조합론으로 직접 계산']]));
    $('validation-method').innerHTML=[
      ['회차 순서대로 가린 검증','각 회차의 예측에는 그 이전 자료만 사용했습니다. 마지막 104회의 성적을 보고 선택 모형을 바꾸지 않았습니다. 공개된 과거 자료를 재현한 검증으로, 아직 오지 않은 회차에서의 실험은 아닙니다.'],
      ['같은 모형을 생성과 평가에 사용','52회·156회 빈도, 52회 저빈도, 반감기 26회의 흐름에 20회분의 균등 사전값을 섞었습니다. 번호 6개의 가중치 곱에 비례해 조합을 뽑고, 이 분포의 정확한 번호 포함 확률로 오차를 계산했습니다.'],
      ['오차와 당첨 횟수를 구분','선택 기준은 Brier 오차입니다. 5게임 과거 결과는 같은 회차를 256번 다시 생성해 관찰한 보조 지표입니다. 회차 4개 단위로 4,000번 재표집한 구간은 근사값이며, 당첨 보증이 아닙니다.'],
      ['고정·제외 번호를 넣으면','검증표는 고정·제외가 없는 기본 모형에 대한 결과입니다. 조건을 추가한 개인 조합에 이 과거 성적을 그대로 적용할 수 없습니다.']
    ].map(([title,content])=>`<article><h3>${title}</h3><p>${content}</p></article>`).join('')+`<p class="hint"><a href="https://otexts.com/fpp3/tscv.html" target="_blank" rel="noopener noreferrer">시계열 검증 방법 ↗</a> · <a href="https://www.itl.nist.gov/div898/handbook/prc/section4/prc463.htm" target="_blank" rel="noopener noreferrer">다중 비교 보정 ↗</a></p>`;
    $('diversity-explanation').innerHTML=[
      ['같은 5게임, 겹침을 줄인 구성','서로 겹치지 않는 30개 번호로 5조합을 만들면 5등 이상이 하나라도 나올 확률은 966,650 / 8,145,060 = 11.8679%입니다. 무작위 5조합 평균 11.3624% 대비 +0.5056%p입니다.'],
      ['개별 조합의 당첨 확률은 동일','어느 한 조합이 본번호 3개 이상을 맞히는 추첨 결과는 194,130개입니다. 여러 조합의 당첨 영역이 겹치면 적어도 한 번 맞힐 수 있는 영역은 줄어듭니다. 기대 당첨 게임 수나 수익이 증가한다는 뜻은 아닙니다.'],
      ['조건을 넣어도 실제 조합으로 계산','고정 번호가 있거나 게임 수가 많으면 완전 비중복 분산이 불가능합니다. 이때 겹침을 줄이는 탐색을 하고, 생성된 조합 각각의 당첨 결과를 합쳐 정확한 확률을 다시 계산합니다. 전역 최적 조합을 보장하지 않습니다.']
    ].map(([title,content])=>`<article><h3>${title}</h3><p>${content}</p></article>`).join('');
    $('number-sort').addEventListener('change',renderNumberDetails);
    $('export-research').addEventListener('click',()=>download(JSON.stringify({source,analysis:A},null,2),'로또_10년_분석.json','application/json;charset=utf-8'));
    $('export-validation').addEventListener('click',()=>download(JSON.stringify(V,null,2),'로또_예측력_검증.json','application/json;charset=utf-8'));
  }
  document.addEventListener('click',event=>{
    const tab=event.target.closest('[data-tab]');
    if(tab) switchTab(tab.dataset.tab);
  });
  $('number-grid').addEventListener('click',event=>{
    const button=event.target.closest('[data-number]'); if(!button) return;
    const n=Number(button.dataset.number), selected=mode==='fixed' ? fixed : excluded, other=mode==='fixed' ? excluded : fixed;
    if(selected.has(n)) selected.delete(n);
    else {
      if(mode==='fixed'&&fixed.size>=6) return toast('고정 번호는 최대 6개입니다. 선택된 번호를 눌러 해제해 주세요.',true);
      if(mode==='excluded'&&excluded.size>=39) return toast('최소 6개 번호가 남아 있어야 합니다.',true);
      selected.add(n); other.delete(n);
    }
    renderNumbers();
    $('number-grid').querySelector(`[data-number="${n}"]`).focus({preventScroll:true});
    $('form-error').hidden=true;
  });
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
    mode=button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});
    $('selection-hint').textContent=mode==='fixed' ? '조합에 꼭 넣을 번호를 선택하세요. 최대 6개' : '조합에서 뺄 번호를 선택하세요. 최소 6개는 남겨 주세요.';
  }));
  document.querySelectorAll('[name="method"]').forEach(input=>input.addEventListener('change',()=>{
    $('balance-options').hidden=input.value!=='balanced';$('model-options').hidden=input.value!=='weighted'; $('form-error').hidden=true;
  }));
  $('amount').addEventListener('input',updateCost);
  $('minus').addEventListener('click',()=>{$('amount').value=Math.max(1,Math.min(20,(Number($('amount').value)||1)-1));updateCost();});
  $('plus').addEventListener('click',()=>{$('amount').value=Math.max(1,Math.min(20,(Number($('amount').value)||1)+1));updateCost();});
  $('reset').addEventListener('click',()=>{
    fixed.clear();excluded.clear();$('amount').value=5;$('avoid-saved').checked=true;
    document.querySelector('[name="method"][value="diverse"]').checked=true;$('balance-options').hidden=true;$('model-options').hidden=true;
    $('min-sum').value=100;$('max-sum').value=180;$('min-odd').value=2;$('max-odd').value=4;
    document.querySelector('[data-mode="fixed"]').click();$('form-error').hidden=true;renderNumbers();updateCost();toast('생성 설정을 초기화했습니다.');
  });
  $('generate').addEventListener('click',()=>{
    generate();
    if($('form-error').hidden) { toast(`${current.games.length}개의 새 조합을 만들었습니다.`); if(window.matchMedia('(max-width:700px)').matches) $('result-title').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto':'smooth',block:'start'}); }
  });
  $('save').addEventListener('click',saveCurrent);$('copy').addEventListener('click',copyNumbers);
  $('csv').addEventListener('click',()=>current&&exportCSV([current]));
  $('export-all').addEventListener('click',()=>exportCSV(saved));
  $('saved-list').addEventListener('click',event=>{
    const exportButton=event.target.closest('[data-export]'), deleteButton=event.target.closest('[data-delete]');
    if(exportButton) {const batch=saved.find(b=>b.id===exportButton.dataset.export);if(batch)exportCSV([batch]);}
    if(deleteButton) {
      const batch=saved.find(b=>b.id===deleteButton.dataset.delete);
      if(batch && window.confirm(`이 묶음의 ${batch.games.length}게임을 보관함에서 삭제할까요? 필요한 기록은 먼저 CSV로 보관해 주세요.`) && persist(saved.filter(b=>b.id!==batch.id))) {renderSaved();toast('선택한 묶음을 삭제했습니다.');}
    }
  });
  $('draw-select').addEventListener('change',selectDraw);$('check').addEventListener('click',checkNumbers);
  ['winning-input','bonus-input'].forEach(id=>$(id).addEventListener('input',()=>{
    $('draw-select').value='manual';activeCheck=null;$('check-results').innerHTML='';$('winning-line').innerHTML='<span>입력한 번호로 대조하기를 눌러 주세요.</span>';
    $('check-message').textContent='당첨번호와 보너스 번호를 확인한 뒤 대조해 주세요.';$('check-message').classList.remove('error-text');renderCurrent();
  }));
  $('stats-range').addEventListener('change',renderStats);
  window.addEventListener('storage',event=>{if(event.key===storageKey){saved=[];storageIssue='';loadSaved();renderSaved();}});
  loadSaved();renderNumbers();renderSaved();setupDraws();setupResearch();setupLag();updateCost();generate();
  if(storageIssue) toast(storageIssue,true);
  // Optional page tools use the exact visible state and generation action.
  if(document.modelContext?.registerTool) {
    const lifecycle=new AbortController();
    const tools=[{
      name:'read_lotto_collection',title:'현재 생성 번호 확인',description:'현재 화면의 생성 번호와 조건, 저장 게임 수를 읽습니다.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:false},
      execute(){return {current:current ? {games:current.games,label:current.label,createdAt:current.createdAt,coverage:current.prizeCoverage||null} : null,savedGames:saved.reduce((n,b)=>n+b.games.length,0),dataThrough:source.metadata.lastDrawDate,forecastAdvantage:V.selectedHoldoutSupportsAdvantage};}
    },{
      name:'generate_lotto_numbers',title:'설정한 조건으로 번호 생성',description:'화면에서 현재 선택한 고정·제외·균형 조건과 게임 수로 새 조합을 생성하고 화면에 표시합니다. 저장하거나 구매하지 않습니다.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(){generate();if(!$('form-error').hidden)throw new Error($('form-error').textContent);switchTab('generate');return {games:current.games,label:current.label};}
    }];
    for(const tool of tools) {
      const execute=tool.execute;
      tool.execute=input=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('이 도구는 빈 객체만 받습니다. 조건은 화면에서 설정해 주세요.');return execute();};
      try { Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{}); } catch {}
    }
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
})();
