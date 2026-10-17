'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../dist/core.js'),P=require('../dist/portfolio.js'),X=require('../dist/coverage.js'),G=require('../dist/generation.js');
const templates=require('../data/portfolio-templates.json'),root=path.resolve(__dirname,'..');
function rng(seed){let state=seed>>>0;return bound=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return Math.floor(state/4294967296*bound);};}
const choose=(n,k)=>{let out=1;for(let i=1;i<=k;i++)out=out*(n-i+1)/i;return out;};
function poolTickets(poolSize){
  const rows=[],row=[];
  function visit(start,left){if(!left){rows.push(row.slice());return;}for(let n=start;n<=poolSize-left+1;n++){row.push(n);visit(n+1,left-1);row.pop();}}
  visit(1,6);return rows;
}
test('일반 생성과 보관 5게임 연결은 기존 정확 확률과 입력을 보존',()=>{
  const standalone=G.generate(templates,[],5,rng(811));
  assert.equal(standalone.numbers.length,5);assert.equal(standalone.roundProfile.probabilities[3].favorable,966650);
  const saved=templates.templates[5].tickets.map(row=>Object.freeze([...row])),snapshot=JSON.stringify(saved);
  const result=G.generate(templates,Object.freeze(saved),5,rng(812));
  assert.equal(result.roundProfile.games,10);assert.equal(result.roundProfile.probabilities[3].favorable,1875065);
  assert.equal(result.numbers.length,5);assert(result.numbers.every(row=>!saved.some(old=>C.key(old)===C.key(row))));
  assert.equal(JSON.stringify(saved),snapshot);
});
test('20게임 초과 비선형 보관 28게임 + 새 5게임의 전체 확률을 독립 조합식과 대조',()=>{
  const saved=poolTickets(8),snapshot=JSON.stringify(saved),result=G.generate(templates,saved,5,rng(813));
  let oldCoverage=0;for(let k=3;k<=6;k++)oldCoverage+=choose(8,k)*choose(37,6-k);
  // All six-subsets of an eight-number pool win iff at least three pool numbers
  // are drawn. New six-number blocks are disjoint from this pool and one another.
  const expected=oldCoverage+5*194130-choose(5,2)*400-5*choose(8,3)*choose(6,3);
  assert.equal(result.roundProfile.games,33);assert.equal(result.roundProfile.exact,true);
  assert.equal(result.roundProfile.probabilities[3].favorable,expected);
  assert.equal(result.roundProfile.probabilities[3].probability,expected/C.TOTAL);
  assert.equal(result.extension.finalFavorable,expected);assert.equal(JSON.stringify(saved),snapshot);
});
test('정확 재탐색 후보가 나쁘면 최초 후보의 당첨 영역을 보존하고 입력은 변경하지 않음',()=>{
  const saved=Object.freeze([Object.freeze([1,2,3,4,5,6]),Object.freeze([1,2,7,8,9,10])]);
  const good=[[11,12,13,14,15,16]],bad=[[1,2,3,4,7,11]],snapshot=JSON.stringify(saved);
  const initial=X.coverageExact([...saved,...good]).favorable;
  assert(X.coverageExact([...saved,...bad]).favorable<initial);
  let calls=0,exactCallbacks=0;
  const extension={extend(_templates,old,amount,_rng,options){
    calls++;assert.equal(amount,1);assert.equal(JSON.stringify(old),snapshot);
    const numbers=options?bad:good;
    if(options){exactCallbacks++;assert.equal(options.evaluateRound([...old,...bad]),X.coverageExact([...old,...bad]).favorable);}
    return {numbers,profile:P.analyze(numbers),roundProfile:null,method:'test',extension:{status:'overlap-fallback'}};
  }};
  const scope={window:{LottoCore:C,LottoPortfolio:P,LottoExtension:extension,LottoCoverage:X}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'dist/generation.js'),'utf8'),scope);
  const result=scope.window.LottoGeneration.generate(templates,saved,1,rng(814));
  assert.equal(calls,9);assert.equal(exactCallbacks,1);
  assert.equal(JSON.stringify(result.numbers),JSON.stringify(good));assert.equal(result.extension.initialFavorable,initial);
  assert.equal(result.extension.finalFavorable,initial);assert.equal(result.roundProfile.probabilities[3].favorable,initial);
  assert.equal(JSON.stringify(saved),snapshot);
});
test('독립 Worker 번들은 네트워크·DOM·require 없이 생성과 20게임 초과 정확 계산을 수행',()=>{
  const names=['core.js','portfolio.js','coverage.js','extension.js','generation.js'];
  const source=names.map(name=>fs.readFileSync(path.join(root,'dist',name),'utf8')).join('\n');
  const replies=[],scope={crypto:require('node:crypto').webcrypto,postMessage:message=>replies.push(message)};
  vm.runInNewContext(source,scope,{filename:'lotto-worker.js'});
  scope.onmessage({data:{type:'generate',templates,saved:[],amount:5}});
  assert.equal(replies[0].ok,true);assert.equal(replies[0].result.numbers.length,5);
  assert.equal(replies[0].result.roundProfile.probabilities[3].favorable,966650);
  const rows=poolTickets(8);scope.onmessage({data:{type:'coverage',numbers:rows}});
  assert.equal(replies[1].ok,true);assert.equal(replies[1].result.games,28);
  let expected=0;for(let k=3;k<=6;k++)expected+=choose(8,k)*choose(37,6-k);
  assert.equal(replies[1].result.probabilities[3].favorable,expected);
  scope.onmessage({data:{type:'coverage',numbers:Array(201).fill([1,2,3,4,5,6])}});
  assert.equal(replies[2].ok,false);assert.match(replies[2].error,/200/);
  scope.onmessage({data:{type:'unknown'}});assert.equal(replies[3].ok,false);
});
