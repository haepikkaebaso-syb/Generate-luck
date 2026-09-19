'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../dist/core.js'),P=require('../dist/portfolio.js'),S=require('../dist/split.js');
const templates=require('../data/portfolio-templates.json'),source=require('../data/draws.json'),model=require('../data/split-risk.json');
const root=path.resolve(__dirname,'..');

test('분할 위험 모형은 현재 공식 자료 전체로 계산됐고 표본 외 검증을 통과',()=>{
 assert.equal(model.sourceRounds.last,source.metadata.lastRound);assert.equal(model.sourceRounds.count,source.draws.length);
 assert.ok(model.model.beta<0);assert.ok(Math.abs(model.model.z)>3);
 assert.ok(model.validation.sumModel<model.validation.constantModel);
 assert.ok(model.validation.firstHalfBeta<0&&model.validation.secondHalfBeta<0);
});

test('합계가 클수록 공동 당첨자 추정이 줄고, 관측 범위 밖은 더 쳐주지 않음',()=>{
 const low=[1,2,4,8,9,11],middle=[5,12,20,28,33,40],high=[20,27,33,38,41,45];
 assert.ok(S.crowd(low,model)>S.crowd(middle,model)&&S.crowd(middle,model)>S.crowd(high,model));
 assert.ok(Math.abs(S.crowd(middle,model)-1)<1e-12); // 합계 138 = 평균
 assert.equal(S.crowd([40,41,42,43,44,45],model),S.crowd([16,25,33,36,38,43],model)); // 둘 다 상한 191 이상
 assert.ok(S.payout([high],model)>1&&S.payout([low],model)<1);
 assert.throws(()=>S.crowd([1,2,3],model));
});

test('손으로 많이 고르는 모양을 표시',()=>{
 assert.match(S.pattern([3,14,15,16,33,41]),/연속/);
 assert.match(S.pattern([2,9,13,20,27,31]),/31 이하/);
 assert.match(S.pattern([1,5,9,12,30,44]),/12 이하/);
 assert.match(S.pattern([15,17,19,21,33,40]),/같은 줄/);
 assert.match(S.pattern([3,10,17,24,40,44]),/같은 칸/);
 assert.match(S.pattern([5,15,25,35,38,44]),/끝수/);
 assert.match(S.pattern([6,13,20,27,34,41]),/같은 칸|같은 간격/);
 assert.equal(S.pattern([4,13,22,29,37,44]),'');
 const past=new Set([C.key(source.draws[0].numbers)]);
 assert.match(S.assess([source.draws[0].numbers],model,past).flags[0],/과거 1등/);
});

test('번호 치환 후보 선택은 배치 구조와 모든 등위의 당첨 확률을 바꾸지 않음',()=>{
 for(const m of [1,5,7,8,20]){
   let best=null,chosen=null;
   for(let i=0;i<60;i++){const candidate=P.generate(templates,m),split=S.assess(candidate.numbers,model);if(S.better(split,best)){best=split;chosen=candidate;}}
   const reference=P.analyze(templates.templates[m].tickets),actual=P.analyze(chosen.numbers);
   for(const k of [3,4,5,6])assert.equal(actual.probabilities[k].favorable,reference.probabilities[k].favorable);
   assert.equal(C.jackpotProbability(chosen.numbers).unique,m);
 }
});

test('번호 맞바꿈 수리는 인기 모양을 없애면서 배치의 당첨 영역을 보존',()=>{
 for(let round=0;round<25;round++){
   const start=P.generate(templates,20),fixed=S.repair(start.numbers,model,new Set());
   assert.equal(fixed.split.flagged,0);
   const before=P.analyze(start.numbers),after=P.analyze(fixed.numbers);
   for(const k of [3,4,5,6])assert.equal(after.probabilities[k].favorable,before.probabilities[k].favorable);
   assert.equal(after.maximumUsage-after.minimumUsage,before.maximumUsage-before.minimumUsage);
 }
 const blockedKey=C.key([1,2,3,4,5,6]);
 assert.ok(!S.repair([[7,8,9,20,30,40]],model,new Set(),C.randomInt,n=>C.key(n)===blockedKey).numbers.some(n=>C.key(n)===blockedKey));
});

test('앱에서 인기 번호대 피하기를 켜면 무작위 치환보다 예상 수령액이 높고 1등 확률 표시는 같음',()=>{
 const markup=fs.readFileSync(path.join(root,'dist/index.html'),'utf8'),app=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
 assert.match(markup,/id="avoid-popular" type="checkbox" checked/);
 const nodes=new Map();
 for(const match of markup.matchAll(/\bid="([^"]+)"/g)){const listeners=new Map();let value='';nodes.set(match[1],{get value(){return value;},set value(v){value=String(v);},textContent:'',innerHTML:'',hidden:false,disabled:false,checked:match[1]==='avoid-popular',classList:{add(){},remove(){},toggle(){}},addEventListener(name,fn){listeners.set(name,fn);},fire(name){return listeners.get(name)({});}});}
 const tools=new Map();
 vm.runInNewContext(app,{document:{getElementById:id=>nodes.get(id),modelContext:{registerTool(a){tools.set(a.name,a);}}},localStorage:{getItem:()=>null,setItem(){}},navigator:{},crypto:crypto.webcrypto,structuredClone,AbortController,Date:class extends Date{constructor(...a){a.length?super(...a):super('2026-09-18T03:00:00Z');}static now(){return Date.parse('2026-09-18T03:00:00Z');}},setTimeout:()=>1,clearTimeout(){},
   window:{LottoRound:require('../dist/round.js'),LottoCore:C,LottoPortfolio:P,LottoSplit:S,LOTTO_DATA:source,LOTTO_PORTFOLIO:templates,LOTTO_SPLIT:model,addEventListener(){}}},{filename:'app.js'});
 const read=()=>tools.get('read_lotto_collection').execute({}).current;
 const on=read(),onSplit=S.assess(on.games,model);
 assert.equal(on.options.avoidPopular,true);assert.equal(onSplit.flagged,0);assert.ok(onSplit.payout>1.05);
 assert.equal(nodes.get('split-card').hidden,false);assert.match(nodes.get('split-payout').textContent,/^\+\d+%$/);
 assert.equal(nodes.get('jackpot-fraction').textContent,'5 / 8,145,060');
 nodes.get('avoid-popular').checked=false;nodes.get('avoid-popular').fire('change');
 assert.equal(read().options.avoidPopular,false);assert.equal(nodes.get('jackpot-fraction').textContent,'5 / 8,145,060');
 for(const m of [7,8,20]){nodes.get('avoid-popular').checked=true;nodes.get('amount').value=String(m);nodes.get('amount').fire('change');assert.equal(read().games.length,m);assert.equal(S.assess(read().games,model).flagged,0,m+'게임에서 인기 모양이 남음');}
});
