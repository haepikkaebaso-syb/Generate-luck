'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../dist/core.js'),P=require('../dist/portfolio.js');
const templates=require('../data/portfolio-templates.json'),source=require('../data/draws.json');
const root=path.resolve(__dirname,'..');
const markup=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');

// A minimal host for the real app's state and event wiring; no browser or visual assertions.
function startApp(initialSaved=[],failInitially=false){
 const nodes=new Map(),tools=new Map(),storage=new Map();
 for(const match of markup.matchAll(/\bid="([^"]+)"/g)){
   const listeners=new Map();let value='';nodes.set(match[1],{get value(){return value;},set value(v){value=String(v);},textContent:'',innerHTML:'',hidden:false,disabled:false,
     classList:{add(){},remove(){},toggle(){}},addEventListener(name,fn){listeners.set(name,fn);},
     fire(name,event={}){assert.ok(listeners.has(name),'Missing listener '+name);return listeners.get(name)(event);}});
 }
 if(initialSaved.length)storage.set('lotto-atelier-645.v1',JSON.stringify(initialSaved));
 let fail=failInitially,queued=[];
 const context={document:{getElementById:id=>{assert.ok(nodes.has(id),'Missing node '+id);return nodes.get(id);},modelContext:{registerTool(action){tools.set(action.name,action);}}},
   localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},navigator:{},
   crypto:crypto.webcrypto,structuredClone,AbortController,Date:class extends Date{constructor(...a){a.length?super(...a):super('2026-09-18T03:00:00Z');}static now(){return Date.parse('2026-09-18T03:00:00Z');}},setTimeout:()=>1,clearTimeout:()=>{},
   window:{LottoRound:require('../dist/round.js'),LottoCore:C,LottoPortfolio:{...P,generate(...args){if(fail)throw new Error('Generation unavailable');return queued.length?queued.shift():P.generate(...args);}},LOTTO_DATA:source,LOTTO_PORTFOLIO:templates,addEventListener(){}}};
 vm.runInNewContext(app,context,{filename:'app.js'});
 return {node:id=>nodes.get(id),read:()=>tools.get('read_lotto_collection').execute({}),storage,setFailure:v=>fail=v,
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
 h.node('draw-select').value='1241';h.node('draw-select').fire('change');h.node('check').fire('click');checkProbability(h,5);
 assert.match(h.node('check-message').textContent,/1241회/);
 h.node('winning-input').value='1 2 3';h.node('check').fire('click');checkProbability(h,5);
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
