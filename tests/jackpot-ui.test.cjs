'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../dist/core.js'),P=require('../dist/portfolio.js');
const templates=require('../data/portfolio-templates.json'),source=require('../data/draws-720-1241.json') // 고정 픽스처: 다음 회차 1242;
const root=path.resolve(__dirname,'..');
const markup=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');

// A minimal host for the real app's state and event wiring; no browser or visual assertions.
function startApp(initialSaved=[],failInitially=false,withExtension=false,runtime=null){
 const nodes=new Map(),tools=new Map(),storage=new Map(),workers=[],windowListeners=new Map();
 for(const match of markup.matchAll(/\bid="([^"]+)"/g)){
   const listeners=new Map();let value='';nodes.set(match[1],{get value(){return value;},set value(v){value=String(v);},textContent:'',innerHTML:'',hidden:false,disabled:false,
     classList:{add(){},remove(){},toggle(){}},addEventListener(name,fn){listeners.set(name,fn);},
     fire(name,event={}){assert.ok(listeners.has(name),'Missing listener '+name);return listeners.get(name)(event);}});
 }
 if(initialSaved.length)storage.set('lotto-atelier-645.v1',JSON.stringify(initialSaved));
 let fail=failInitially,queued=[];
 const generation=runtime?require('../dist/generation.js'):null;
 class FakeWorker{constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}complete(result){this.onmessage({data:{ok:true,result:result||generation.run(this.message)}});}fail(){this.onerror();}}
 const context={document:{getElementById:id=>{assert.ok(nodes.has(id),'Missing node '+id);return nodes.get(id);},modelContext:{registerTool(action){tools.set(action.name,action);}}},
   localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},navigator:{},
   crypto:crypto.webcrypto,structuredClone,AbortController,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Date:class extends Date{constructor(...a){a.length?super(...a):super('2026-09-18T03:00:00Z');}static now(){return Date.parse('2026-09-18T03:00:00Z');}},setTimeout:()=>1,clearTimeout:()=>{},
   window:{LottoGeneration:generation,Worker:runtime==='worker'?FakeWorker:undefined,LOTTO_WORKER_SOURCE:runtime==='worker'?'test-worker':undefined,LottoExtension:withExtension?require('../dist/extension.js'):undefined,LottoRound:require('../dist/round.js'),LottoCore:C,LottoPortfolio:{...P,generate(...args){if(fail)throw new Error('Generation unavailable');return queued.length?queued.shift():P.generate(...args);}},LOTTO_DATA:source,LOTTO_PORTFOLIO:templates,addEventListener(name,fn,options){if(!windowListeners.has(name))windowListeners.set(name,[]);windowListeners.get(name).push({fn,once:!!options?.once});}}};
 vm.runInNewContext(app,context,{filename:'app.js'});
 return {node:id=>nodes.get(id),read:()=>tools.get('read_lotto_collection').execute({}),storage,workers,setFailure:v=>fail=v,
   fireWindow(name,event={}){assert.ok(windowListeners.has(name),'Missing window listener '+name);for(const listener of [...windowListeners.get(name)]){if(listener.once)windowListeners.set(name,windowListeners.get(name).filter(item=>item!==listener));listener.fn(event);}},
   queue(...results){queued.push(...results);},amount(n){nodes.get('amount').value=String(n);nodes.get('amount').fire('change');},round(n){nodes.get('target-round').value=String(n);nodes.get('target-round').fire('change');}};
}
const fmt=n=>n.toLocaleString('ko-KR');
function checkProbability(h,unique,currentUnique=unique){
 assert.equal(h.node('jackpot-percent').textContent,(unique/C.TOTAL*100).toFixed(8));
 assert.equal(h.node('jackpot-fraction').textContent,fmt(unique)+' / '+fmt(C.TOTAL));
 const denom=C.TOTAL/unique;
 assert.equal(h.node('jackpot-reciprocal').textContent,(Number.isInteger(denom)?'':'약 ')+fmt(Math.round(denom))+'분의 1');
 assert.equal(h.node('unique-badge').textContent,'현재 고유 조합 '+fmt(currentUnique)+'개');
 assert.match(h.node('probability-table').innerHTML,/^<tr class="jackpot-table-row"><th scope="row">1등/);
}

test('처음 5게임과 변경한 1~20게임의 1등 확률·정확한 분수·역수가 실제 조합과 일치',()=>{
 const h=startApp();checkProbability(h,5);
 for(let m=1;m<=20;m++){
   h.amount(m);const current=h.read().current;
   assert.equal(current.games.length,m);assert.equal(C.jackpotProbability(current.games).unique,m);
   checkProbability(h,m);assert.equal(h.node('jackpot-title').textContent,'1242회 전체 '+m+'게임의 1등 확률');
 }
});

test('번호를 새로 섞고 저장하거나 과거 회차를 대조해도 현재 묶음의 1등 확률을 보존',()=>{
 const legacy={id:'legacy',createdAt:'2026-09-01T00:00:00Z',label:'이전 버전',games:[[1,2,3,4,5,6],[6,5,4,3,2,1]]};
 const h=startApp([legacy]);checkProbability(h,5);
 h.node('generate').fire('click');checkProbability(h,5);
 h.node('save').fire('click');checkProbability(h,5);
 assert.equal(h.read().savedGames,7);
 assert.equal(JSON.parse(h.storage.get('lotto-atelier-645.v1')).length,2);
 h.node('manual-round').value='1242';h.node('winning-input').value='1 2 3 4 5 6';h.node('bonus-input').value='7';h.node('check').fire('click');checkProbability(h,5);
 assert.match(h.node('check-message').textContent,/1242회 당첨번호로 대조/);
 h.node('winning-input').value='1 2 3';h.node('check').fire('click');checkProbability(h,5);
 assert.match(h.node('check-message').textContent,/본번호 6개/);
});

test('표시 분자는 실제 여섯 번호를 중복 제거해 계산하고 게임 수나 profile로 대체하지 않음',()=>{
 const h=startApp(),current=h.read().current;
 const [a,b]=current.games;
 current.games=[a,[...a].reverse(),b];current.profile=P.analyze([a,b]);
 h.node('winning-input').fire('input');
 checkProbability(h,2);
 assert.equal(h.node('jackpot-title').textContent,'1242회 전체 2게임의 1등 확률');
 assert.match(h.node('jackpot-coverage').textContent,/고유 조합 2개/);
});

test('다음 생성이 실패하면 화면에 남아 있는 기존 번호의 확률을 유지',()=>{
 const h=startApp(),before=JSON.stringify(h.read().current.games);
 h.setFailure(true);h.amount(20);
 assert.equal(h.node('form-error').hidden,false);
 assert.equal(JSON.stringify(h.read().current.games),before);checkProbability(h,5);
 assert.equal(h.node('jackpot-title').textContent,'1242회 전체 5게임의 1등 확률');
});

test('같은 회차의 보관함과 현재 묶음을 합쳐 중복을 제거한 전체 1등 확률을 표시',()=>{
 const duplicate=[1,2,3,4,5,6];
 const saved={id:'round-1242',createdAt:'2026-09-18T00:00:00Z',targetRound:1242,label:'구매 번호',games:[duplicate,[...duplicate].reverse()]};
 const h=startApp([saved]),coverage=h.read().roundCoverage;
 assert.equal(coverage.savedGames,2);assert.equal(coverage.currentGames,5);
 assert.equal(coverage.entries,7);assert.equal(coverage.duplicates,1);assert.equal(coverage.unique,6);
 checkProbability(h,6,5);assert.match(h.node('jackpot-coverage').textContent,/중복 1개를 제외한 고유 조합 6개/);
 h.round(1243);checkProbability(h,5);assert.equal(h.read().roundCoverage.round,1243);
});

test('새 묶음은 같은 회차 보관함과 겹치면 버리고 다른 고유 조합을 사용',()=>{
 const blocked=[1,2,3,4,5,6],fresh=[1,2,3,4,5,7];
 const saved={id:'blocked',createdAt:'2026-09-18T00:00:00Z',targetRound:1242,label:'구매 번호',games:[blocked]};
 const h=startApp([saved]);
 h.queue({numbers:[blocked],profile:P.analyze([blocked]),method:'test'},{numbers:[fresh],profile:P.analyze([fresh]),method:'test'});
 h.amount(1);
 assert.deepEqual(Array.from(h.read().current.games[0]),fresh);
 assert.equal(h.read().roundCoverage.unique,2);checkProbability(h,2,1);
});

test('처음 생성에 실패하면 계산된 확률이나 무한대 역수를 표시하지 않음',()=>{
 const h=startApp([],true);
 assert.equal(h.read().current,null);assert.equal(h.node('form-error').hidden,false);
 assert.equal(h.node('jackpot-percent').textContent,'');
 assert.equal(h.node('jackpot-reciprocal').textContent,'');
 assert.match(markup,/id="jackpot-percent">—</);
 assert.match(markup,/id="jackpot-reciprocal"[^>]*>번호를 생성하면 표시됩니다\.</);
});

test('실제 추가 생성 연결: 저장한5게임을 유지하고 전체10게임의 5등 이상 확률을 표시',()=>{
 const rows=Array.from({length:5},(_,i)=>Array.from({length:6},(_,j)=>6*i+j+1));
 const saved={id:'old-five',createdAt:'2026-09-18T00:00:00Z',targetRound:1242,label:'구매한5게임',games:rows};
 const h=startApp([saved],false,true),current=h.read().current;
 assert.equal(current.extension.status,'template-extension');
 assert.equal(P.analyze([...rows,...current.games]).probabilities[3].favorable,1875065);
 assert.equal(h.node('prize-probability').textContent,'23.02');assert.match(h.node('chance-scope').textContent,/10게임/);
 assert.deepEqual(JSON.parse(h.storage.get('lotto-atelier-645.v1')),[saved]);
 h.node('save').fire('click');assert.equal(h.node('prize-probability').textContent,'23.02');checkProbability(h,10,5);
 h.round(1243);assert.equal(h.node('prize-probability').textContent,'11.87');checkProbability(h,5,5);
});

test('임의 보관 번호의 전체 확률을 계산할 수 없으면 현재 묶음 기준임을 표시',()=>{
 const saved={id:'overlapping',createdAt:'2026-09-18T00:00:00Z',targetRound:1242,label:'기존번호',games:[[1,2,3,4,5,6],[1,2,7,8,9,10]]};
 const h=startApp([saved],false,true);
 assert.match(h.node('round-prize-note').textContent,/현재 묶음만/);assert.match(h.node('chance-scope').textContent,/현재 5게임/);
 assert.equal(h.node('prize-probability').textContent,'11.87');checkProbability(h,7,5);
});

test('새 정확 엔진은 비선형 보관 번호까지 합친 회차 전체 확률을 표시하고 저장 후 보존',()=>{
 const saved={id:'nonlinear',createdAt:'2026-09-18T00:00:00Z',targetRound:1242,label:'기존번호',games:[[1,2,3,4,5,6],[1,2,7,8,9,10]]};
 const h=startApp([saved],false,true,'sync'),current=h.read().current;
 const exact=require('../dist/research.js').coverageExact([...saved.games,...current.games]);
 assert.equal(h.node('prize-probability').textContent,(exact.probability*100).toFixed(2));
 assert.match(h.node('chance-scope').textContent,/보관함 \+ 현재 7게임/);
 assert.deepEqual(JSON.parse(h.storage.get('lotto-atelier-645.v1')),[saved]);
 h.node('save').fire('click');assert.equal(h.node('prize-probability').textContent,(exact.probability*100).toFixed(2));
});

test('백그라운드 계산 중 저장을 막고 회차 변경 뒤 늦은 응답을 무시',async()=>{
 const saved={id:'five',createdAt:'2026-09-18T00:00:00Z',targetRound:1242,label:'기존번호',games:templates.templates[5].tickets};
 const h=startApp([saved],false,true,'worker');
 assert.equal(h.workers.length,1);assert.equal(h.node('save').disabled,true);assert.equal(h.node('generation-status').hidden,false);
 h.node('save').fire('click');assert.deepEqual(JSON.parse(h.storage.get('lotto-atelier-645.v1')),[saved]);
 h.round(1243);const before=JSON.stringify(h.read().current);
 assert.equal(h.workers[0].terminated,true);h.workers[0].complete();await Promise.resolve();await Promise.resolve();
 assert.equal(JSON.stringify(h.read().current),before);assert.equal(h.read().current.targetRound,1243);
 assert.equal(h.node('save').disabled,false);assert.equal(h.node('form-error').hidden,true);
});

test('백그라운드 새 게임 수만 적용하고 실패 시 이전 번호와 확률을 보존',async()=>{
 const saved={id:'five',createdAt:'2026-09-18T00:00:00Z',targetRound:1242,label:'기존번호',games:templates.templates[5].tickets};
 const h=startApp([saved],false,true,'worker');h.amount(2);
 assert.equal(h.workers.length,2);assert.equal(h.workers[0].terminated,true);
 h.workers[1].complete();await Promise.resolve();await Promise.resolve();
 assert.equal(h.read().current.games.length,2);assert.equal(h.node('generation-status').hidden,true);
 const before=JSON.stringify(h.read().current),probability=h.node('prize-probability').textContent;
 h.amount(8);h.workers[2].fail();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(JSON.stringify(h.read().current),before);assert.equal(h.node('prize-probability').textContent,probability);
 assert.equal(h.node('form-error').hidden,false);assert.equal(h.node('save').disabled,false);
});

test('계산 중 BFCache 이동은 작업과 busy 상태를 해제하고 복귀하면 재시작',async()=>{
 const saved={id:'bfcache-five',createdAt:'2026-09-18T00:00:00Z',targetRound:1242,label:'기존번호',games:templates.templates[5].tickets};
 const h=startApp([saved],false,true,'worker');
 h.workers[0].complete();await Promise.resolve();await Promise.resolve();
 const before=JSON.stringify(h.read().current),stored=h.storage.get('lotto-atelier-645.v1');
 h.amount(8);const cancelled=h.workers[1];
 assert.equal(h.node('generate').disabled,true);assert.equal(h.node('save').disabled,true);
 h.fireWindow('pagehide',{persisted:true});
 assert.equal(cancelled.terminated,true);assert.equal(h.node('generate').disabled,false);
 assert.equal(h.node('save').disabled,false);assert.equal(h.node('generation-status').hidden,true);
 assert.equal(JSON.stringify(h.read().current),before);
 h.fireWindow('pageshow',{persisted:true});
 assert.equal(h.workers.length,3);assert.equal(h.workers[2].message.amount,8);
 assert.equal(h.node('generate').disabled,true);assert.equal(h.node('save').disabled,true);
 assert.equal(h.node('generation-status').hidden,false);
 cancelled.complete({numbers:[]});await Promise.resolve();await Promise.resolve();
 assert.equal(JSON.stringify(h.read().current),before);assert.equal(h.node('generate').disabled,true);
 assert.equal(h.node('form-error').hidden,true);
 h.workers[2].complete();await Promise.resolve();await Promise.resolve();
 assert.equal(h.read().current.games.length,8);assert.equal(h.read().current.targetRound,1242);
 assert.equal(h.node('generate').disabled,false);assert.equal(h.node('save').disabled,false);
 assert.equal(h.node('generation-status').hidden,true);assert.equal(h.node('form-error').hidden,true);
 assert.equal(h.storage.get('lotto-atelier-645.v1'),stored);checkProbability(h,13,8);
});

test('계산하지 않을 때 BFCache 복귀는 번호·확률을 보존하고 새 Worker를 만들지 않음',async()=>{
 const saved={id:'bfcache-idle',createdAt:'2026-09-18T00:00:00Z',targetRound:1242,label:'기존번호',games:templates.templates[5].tickets};
 const h=startApp([saved],false,true,'worker');
 h.workers[0].complete();await Promise.resolve();await Promise.resolve();
 const before=JSON.stringify(h.read().current),probability=h.node('prize-probability').textContent,stored=h.storage.get('lotto-atelier-645.v1');
 for(let visit=0;visit<2;visit++){
   h.fireWindow('pagehide',{persisted:true});h.fireWindow('pageshow',{persisted:true});
   await Promise.resolve();await Promise.resolve();
   assert.equal(h.workers.length,1);assert.equal(JSON.stringify(h.read().current),before);
   assert.equal(h.node('prize-probability').textContent,probability);
   assert.equal(h.node('generate').disabled,false);assert.equal(h.node('save').disabled,false);
   assert.equal(h.node('generation-status').hidden,true);assert.equal(h.node('form-error').hidden,true);
   assert.equal(h.storage.get('lotto-atelier-645.v1'),stored);checkProbability(h,10,5);
 }
});
