'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../dist/core.js');
function combinations(pool,k){
  if(!k)return [[]];
  return pool.flatMap((n,i)=>combinations(pool.slice(i+1),k-1).map(rest=>[n,...rest]));
}
test('전체 조합 수와 첫·마지막 조합',()=>{
  const space=C.createSpace();
  assert.equal(space.total,8145060);
  assert.deepEqual(space.unrank(0),[1,2,3,4,5,6]);
  assert.deepEqual(space.unrank(space.total-1),[40,41,42,43,44,45]);
  for(const rank of [0,1,1234,456789,4000000,8145059])assert.equal(space.rankOf(space.unrank(rank)),rank);
});
test('조건 공간을 독립적인 조합 열거 결과와 전수 비교',()=>{
  const pool=[1,2,3,4,5,6,7,8,9,10];
  const excluded=Array.from({length:35},(_,i)=>i+11);
  for(const fixed of [[],[1],[2,5]])for(const [minSum,maxSum,minOdd,maxOdd] of [[21,255,0,6],[25,35,2,4],[30,45,3,3],[21,25,0,1]]){
    const expected=combinations(pool,6).filter(n=>fixed.every(f=>n.includes(f))).filter(n=>{
      const m=C.metrics(n);return m.sum>=minSum&&m.sum<=maxSum&&m.odd>=minOdd&&m.odd<=maxOdd;
    });
    const space=C.createSpace({fixed,excluded,minSum,maxSum,minOdd,maxOdd});
    assert.equal(space.total,expected.length);
    expected.forEach((n,i)=>{assert.deepEqual(space.unrank(i),n);assert.equal(space.rankOf(n),i);});
  }
});
test('작은 후보 공간에서 모든 차단 경우와 후보 고갈 처리',()=>{
  const options={fixed:[1,2,3,4,5],excluded:Array.from({length:36},(_,i)=>i+10)};
  const combos=[6,7,8,9].map(n=>[1,2,3,4,5,n]);
  for(let mask=0;mask<16;mask++){
    const blocked=combos.filter((_,i)=>mask&(1<<i));
    const available=combos.filter((_,i)=>!(mask&(1<<i)));
    if(!available.length){assert.throws(()=>C.generate(options,1,blocked),/새 조합은 0개/);continue;}
    const actual=C.generate(options,available.length,[...blocked,...blocked],()=>0);
    assert.deepEqual(actual.numbers.map(C.key).sort(),available.map(C.key).sort());
  }
});
test('여러 조건의 실제 난수 생성에서 번호 유효성과 조합 고유성',()=>{
  for(const options of [{},{fixed:[7,21],excluded:[1,2,3]},{minSum:100,maxSum:180,minOdd:2,maxOdd:4}]){
    const {numbers}=C.generate(options,20);
    assert.equal(new Set(numbers.map(C.key)).size,20);
    for(const n of numbers){assert(C.validNumbers(n,6));assert.deepEqual(n,[...n].sort((a,b)=>a-b));for(const f of options.fixed||[])assert(n.includes(f));for(const e of options.excluded||[])assert(!n.includes(e));}
  }
});
test('uint32 난수 상단 거부로 나머지 연산 편향을 방지',()=>{
  const values=[4294967295,4294967290,4294967289];
  assert.equal(C.randomInt(10,()=>values.shift()),9);
  assert.equal(values.length,0);
  assert.equal(C.randomInt(1,()=>4294967295),0);
});
test('불가능한 입력과 고정 6개 경계',()=>{
  assert.throws(()=>C.createSpace({fixed:[1,2,3,4,5,6,7]}),/최대 6개/);
  assert.throws(()=>C.createSpace({fixed:[1],excluded:[1]}),/겹칩니다/);
  assert.throws(()=>C.createSpace({minSum:180,maxSum:100}),/조건/);
  assert.throws(()=>C.generate({},0),/1~20/);
  assert.throws(()=>C.generate({},1.5),/1~20/);
  const options={fixed:[1,2,3,4,5,6]};
  assert.deepEqual(C.generate(options,1).numbers,[[1,2,3,4,5,6]]);
  assert.throws(()=>C.generate(options,2),/새 조합은 1개/);
});
test('1~5등, 보너스 및 미당첨 판정',()=>{
  const winning=[1,2,3,4,5,6];
  for(const [numbers,rank] of [[[1,2,3,4,5,6],1],[[1,2,3,4,5,7],2],[[1,2,3,4,5,8],3],[[1,2,3,4,7,8],4],[[1,2,3,7,8,9],5],[[1,2,7,8,9,10],0]])assert.equal(C.match(numbers,winning,7).rank,rank);
  assert.equal(C.match([1,2,3,4,5,7],winning).rank,null);
  assert.throws(()=>C.match(winning,winning,6),/달라야/);
});
test('확률 분자는 순서에 상관없이 서로 다른 유효 조합만 집계',()=>{
  const n=[1,2,3,4,5,6];
  assert.equal(C.jackpotProbability([n,[...n].reverse(),[1,1,2,3,4,5]]).probability,1/8145060);
  assert.equal(C.jackpotProbability([]).probability,0);
  assert.equal(C.jackpotProbability(C.generate({},5).numbers).probability,5/8145060);
});
test('최근 10년 공식 522회 모두 범위·날짜·회차·보너스 검증',()=>{
  const {draws,metadata}=require('../data/draws.json');
  assert.equal(draws.length,522);assert.equal(metadata.sourceType,'official-primary');assert.equal(metadata.lastDrawDate,'2026-09-12');
  draws.forEach((d,i)=>{
    assert.equal(d.round,i+720);assert(C.validNumbers(d.numbers,6));C.match(d.numbers,d.numbers,d.bonus);
    if(i)assert.equal(Date.parse(d.date)-Date.parse(draws[i-1].date),7*86400000);
  });
});
test('HTML의 참조 ID, 오프라인 파일과 스크립트 구성이 일치',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size,'duplicate HTML IDs');
  for(const match of app.matchAll(/\$\('([^']+)'\)/g))if(!match[1].endsWith('-'))assert(ids.includes(match[1]),'missing ID: '+match[1]);
  const standalone=fs.readFileSync(path.join(__dirname,'../로또번호 생성기.html'),'utf8');
  assert(!standalone.includes('<script defer src='));assert(!standalone.includes('<link rel="stylesheet"'));
  assert.equal([...standalone.matchAll(/<script>/g)].length,4);
  assert(standalone.indexOf('window.LOTTO_DATA =') < standalone.indexOf('const source = window.LOTTO_DATA'));
});
