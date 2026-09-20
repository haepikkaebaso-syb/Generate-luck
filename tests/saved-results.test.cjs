'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../dist/core.js'),P=require('../dist/portfolio.js'),S=require('../dist/split.js'),R=require('../dist/round.js');
const templates=require('../data/portfolio-templates.json'),source=require('../data/draws.json'),model=require('../data/split-risk.json');
const root=path.resolve(__dirname,'..');
const markup=fs.readFileSync(path.join(root,'dist/index.html'),'utf8'),app=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const last=source.draws.at(-1); // 1241회: 7 13 16 23 24 43 + 9

function startApp(saved,data=source){
 const nodes=new Map(),storage=new Map();
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

test('보관함은 묶음마다 당첨 게임 수를, 게임마다 일치 개수·등위와 맞은 번호 테두리를 표시',()=>{
 const list=startApp([saturday,tuesday]).node('saved-list').innerHTML;
 assert.equal(list.match(/당첨 2게임/g).length,1);assert.equal(list.match(/당첨 1게임/g).length,1);
 assert.match(list,/class="game-result win">5개 · 2등</);assert.match(list,/class="game-result win">4개 · 4등</);assert.match(list,/class="game-result win">3개 · 5등</);
 assert.match(list,/class="game-result">0개 · 미당첨</);
 assert.match(list,/class="ball c1 small match">7</);assert.match(list,/class="ball c1 small bonus">9</);
 assert.doesNotMatch(list,/class="ball c1 small match">1</);
});

test('모두 미당첨이면 그대로 알리고, 당첨번호가 아직 없는 회차와 회차 미기록 묶음은 대조하지 않음',()=>{
 const miss=batch('miss',last.round,[[1,2,3,4,5,6]]),future=batch('next',last.round+1,[[7,13,16,23,24,43]]),legacy=batch('old',0,[[7,13,16,23,24,43]]);
 const h=startApp([future,legacy,miss]),list=h.node('saved-list').innerHTML;
 assert.equal(h.node('result-summary').textContent,'모두 미당첨');assert.ok(!h.node('result-banner').classes.has('won'));
 assert.match(list,new RegExp((last.round+1)+'회 당첨번호가 아직 없습니다'));assert.match(list,/구매 회차가 기록되지 않아/);
 assert.equal(list.match(/game-result/g).length,1); // 추첨 전·회차 미기록 묶음에는 결과를 붙이지 않음
 assert.equal(startApp([future]).node('result-banner').hidden,true);
 assert.equal(startApp([]).node('result-banner').hidden,true);
});

test('새 회차 당첨번호가 들어오면 그 회차로 보관한 번호의 결과로 바뀜',()=>{
 const next={round:last.round+1,date:'2026-09-19',numbers:[2,4,10,16,31,41],bonus:9};
 const data={metadata:{...source.metadata,lastRound:next.round,lastDrawDate:next.date},draws:[...source.draws,next]};
 const h=startApp([batch('new',next.round,[[2,4,10,20,30,40],[2,4,10,16,31,41]]),tuesday],data);
 assert.equal(h.node('banner-title').textContent,next.round+'회 추첨 결과 · 보관한 2게임');
 assert.equal(h.node('result-summary').textContent,'1등 1게임 · 5등 1게임');
 assert.match(h.node('saved-list').innerHTML,/당첨 2게임/); // 지난 회차 묶음의 결과도 보관함에는 계속 표시
});

test('화면의 id는 서로 겹치지 않음',()=>{
 const ids=[...markup.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(ids.filter((id,i)=>ids.indexOf(id)!==i),[]);
});

test('요약의 버튼은 보관함을 펼침',()=>{
 const h=startApp([tuesday]);assert.equal(h.node('collection-panel').open,false);
 h.node('result-open').fire('click');assert.equal(h.node('collection-panel').open,true);
});
