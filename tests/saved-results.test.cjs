'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../dist/core.js'),P=require('../dist/portfolio.js'),S=require('../dist/split.js'),R=require('../dist/round.js');
const templates=require('../data/portfolio-templates.json'),source=require('../data/draws.json'),model=require('../data/split-risk.json');
const root=path.resolve(__dirname,'..');
const markup=fs.readFileSync(path.join(root,'dist/index.html'),'utf8'),app=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const last=source.draws.at(-1); // 1241회: 7 13 16 23 24 43 + 9

function startApp(saved,data=source,storage=new Map()){
 const nodes=new Map();
 for(const match of markup.matchAll(/\bid="([^"]+)"/g)){const listeners=new Map(),classes=new Set();let value='';nodes.set(match[1],{get value(){return value;},set value(v){value=String(v);},textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,classes,
   classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c)},addEventListener(name,fn){listeners.set(name,fn);},fire(name){return listeners.get(name)({});}});}
 if(saved.length)storage.set('lotto-atelier-645.v1',JSON.stringify(saved));
 vm.runInNewContext(app,{document:{getElementById:id=>{assert.ok(nodes.has(id),'Missing node '+id);return nodes.get(id);}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},navigator:{},crypto:crypto.webcrypto,structuredClone,AbortController,
   Date:class extends Date{constructor(...a){a.length?super(...a):super('2026-09-18T03:00:00Z');}static now(){return Date.parse('2026-09-18T03:00:00Z');}},setTimeout:()=>1,clearTimeout(){},
   window:{LottoRound:R,LottoCore:C,LottoPortfolio:P,LottoSplit:S,LOTTO_DATA:data,LOTTO_PORTFOLIO:templates,LOTTO_SPLIT:model,addEventListener(){}}},{filename:'app.js'});
 return {node:id=>nodes.get(id),storage};
}
const batch=(id,targetRound,games)=>({id,createdAt:'2026-09-08T03:00:00Z',label:'구매 번호',...(targetRound?{targetRound}:{}),games});
const tuesday=batch('tue',last.round,[[3,7,13,16,30,40],[1,2,3,4,5,6],[7,9,13,16,23,24],[10,20,30,40,41,42],[5,15,25,35,44,45]]);
const saturday=batch('sat',last.round,[[7,13,16,23,40,41],[1,2,3,4,5,6],[8,18,28,38,39,42],[11,12,21,22,31,32],[2,14,26,33,37,45]]);

test('같은 회차로 화요일·토요일에 보관한 번호를 그 회차 당첨번호와 자동 대조해 한눈에 요약',()=>{
 const h=startApp([saturday,tuesday]);
 assert.equal(h.node('result-banner').hidden,false);
 assert.equal(h.node('banner-title').textContent,last.round+'회 추첨 결과 · 보관한 9게임'); // 같은 여섯 번호 1쌍은 한 번만 셈
 assert.equal(h.node('result-summary').textContent,'2등 1게임 · 4등 1게임 · 5등 1게임 · 미당첨 6게임');
 assert.ok(h.node('result-banner').classes.has('won'));
 for(const n of [...last.numbers,last.bonus])assert.match(h.node('result-numbers').innerHTML,new RegExp('>'+n+'</span>'));
 assert.match(markup,/참고용 결과입니다\. 실제 당첨 여부와 당첨금은 복권의 QR 코드나 판매점에서 확인/);
});

test('보관함은 회차별로 모아 당첨번호를 한 번만 보여 주고, 게임마다 오른쪽에 등위·일치 개수와 맞은 번호 테두리를 표시',()=>{
 const list=startApp([saturday,tuesday]).node('saved-list').innerHTML;
 assert.equal(list.match(/class="saved-round"/g).length,1);assert.equal(list.match(/공식 당첨번호/g).length,1);
 assert.match(list,new RegExp(last.round+'회 · 10게임'));assert.match(list,/2번째 저장 · 5게임[\s\S]*1번째 저장 · 5게임/);
 assert.match(list,/<strong>2등 1게임 · 4등 1게임 · 5등 1게임 · 미당첨 6게임<\/strong>/);
 assert.match(list,/class="game-result win"><b>2등<\/b><small>5개\+보너스</);assert.match(list,/class="game-result win"><b>4등<\/b><small>4개 일치</);assert.match(list,/class="game-result win"><b>5등<\/b><small>3개 일치</);
 assert.match(list,/class="game-result"><b>미당첨<\/b><small>0개 일치</);
 assert.match(list,/class="ball c1 small match">7</);assert.match(list,/class="ball c1 small bonus">9</);
 assert.doesNotMatch(list,/class="ball c1 small match">1</);
});

test('모두 미당첨이면 그대로 알리고, 당첨번호가 아직 없는 회차와 회차 미기록 묶음은 대조하지 않음',()=>{
 const miss=batch('miss',last.round,[[1,2,3,4,5,6]]),future=batch('next',last.round+1,[[7,13,16,23,24,43]]),legacy=batch('old',0,[[7,13,16,23,24,43]]);
 const h=startApp([future,legacy,miss]),list=h.node('saved-list').innerHTML;
 assert.equal(h.node('result-summary').textContent,'모두 미당첨');assert.ok(!h.node('result-banner').classes.has('won'));
 assert.match(list,new RegExp((last.round+1)+'회 당첨번호가 아직 없습니다'));assert.match(list,/구매 회차가 기록되지 않아/);
 assert.equal(list.match(/game-result/g).length,1); // 추첨 전·회차 미기록 묶음에는 결과를 붙이지 않음
 assert.ok(list.indexOf((last.round+1)+'회 · 1게임')<list.indexOf(last.round+'회 · 1게임')&&list.indexOf(last.round+'회 · 1게임')<list.indexOf('회차 미지정')); // 최신 회차부터
 assert.equal(startApp([future]).node('result-banner').hidden,true);
 assert.equal(startApp([]).node('result-banner').hidden,true);
});

test('새 회차 당첨번호가 들어오면 그 회차로 보관한 번호의 결과로 바뀜',()=>{
 const next={round:last.round+1,date:'2026-09-19',numbers:[2,4,10,16,31,41],bonus:9};
 const data={metadata:{...source.metadata,lastRound:next.round,lastDrawDate:next.date},draws:[...source.draws,next]};
 const h=startApp([batch('new',next.round,[[2,4,10,20,30,40],[2,4,10,16,31,41]]),tuesday],data);
 assert.equal(h.node('banner-title').textContent,next.round+'회 추첨 결과 · 보관한 2게임');
 assert.equal(h.node('result-summary').textContent,'1등 1게임 · 5등 1게임');
 assert.equal(h.node('saved-list').innerHTML.match(/class="saved-round"/g).length,2); // 지난 회차 결과도 보관함에는 계속 표시
});

test('아직 공식 자료가 없는 회차는 당첨번호를 직접 입력해 대조하고, 공식 자료가 들어오면 공식 번호가 우선',()=>{
 const future=batch('next',last.round+1,[[1,2,3,20,30,40],[11,12,13,14,15,16]]);
 const h=startApp([future]);assert.equal(h.node('manual-round').value,String(last.round+1));
 h.node('winning-input').value='3, 2, 1, 44, 45, 43';h.node('bonus-input').value='7';h.node('check').fire('click');
 assert.equal(h.node('banner-title').textContent,(last.round+1)+'회 추첨 결과 · 보관한 2게임 (직접 입력한 당첨번호)');
 assert.equal(h.node('result-summary').textContent,'5등 1게임 · 미당첨 1게임');
 assert.match(h.node('saved-list').innerHTML,/직접 입력한 당첨번호/);
 assert.equal(h.node('current-check').hidden,false); // 현재 묶음도 같은 회차라 함께 대조
 assert.match(h.node('tickets').innerHTML,/game-result/);
 for(const [field,value,error] of [['bonus-input','','보너스'],['bonus-input','3','달라야'],['winning-input','1 2 3','본번호 6개'],['manual-round',String(last.round),'공식 당첨번호가 이미']]){
   const g=startApp([future]);g.node('winning-input').value='1 2 3 43 44 45';g.node('bonus-input').value='7';g.node(field).value=value;g.node('check').fire('click');
   assert.match(g.node('check-message').textContent,new RegExp(error));assert.equal(g.node('result-banner').hidden,true);
 }
 // 직접 입력은 기기에 남고, 같은 회차의 공식 자료가 생기면 공식 번호로 대조한다.
 const official={round:last.round+1,date:'2026-09-19',numbers:[11,12,13,14,15,16],bonus:9};
 const data={metadata:{...source.metadata,lastRound:official.round,lastDrawDate:official.date},draws:[...source.draws,official]};
 const again=startApp([future],data,h.storage);
 assert.equal(again.node('banner-title').textContent,official.round+'회 추첨 결과 · 보관한 2게임');assert.equal(again.node('result-summary').textContent,'1등 1게임 · 미당첨 1게임');
});

test('현재 화면의 번호는 회차에 당첨번호가 있을 때만 대조 표시',()=>{
 const h=startApp([]);assert.equal(h.node('current-check').hidden,true);assert.doesNotMatch(h.node('tickets').innerHTML,/game-result/);
 h.node('target-round').value=String(last.round);h.node('target-round').fire('change');
 assert.equal(h.node('current-check').hidden,false);assert.match(h.node('current-check').textContent,new RegExp(last.round+'회 공식 당첨번호'));
 assert.equal(h.node('tickets').innerHTML.match(/game-result/g).length,5);
});

test('화면의 id는 서로 겹치지 않음',()=>{
 const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(ids.filter((id,i)=>ids.indexOf(id)!==i),[]);
});

test('요약의 버튼은 보관함을 펼침',()=>{
 const h=startApp([tuesday]);assert.equal(h.node('collection-panel').open,false);
 h.node('result-open').fire('click');assert.equal(h.node('collection-panel').open,true);
});
