'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core.js'),P=require('../dist/portfolio.js'),E=require('../dist/extension.js');
const R=require('../dist/research.js'),D=require('../data/portfolio-templates.json');
const rng=seed=>{const random=R.seededRandom(seed);return n=>Math.floor(random()*n);};
const disjoint=n=>Array.from({length:n},(_,i)=>Array.from({length:6},(_,j)=>6*i+j+1));
function validate(result,saved,amount){
  assert.equal(result.numbers.length,amount);
  const existing=new Set(saved.map(C.key));
  assert(result.numbers.every(row=>!existing.has(C.key(row))));
  assert.equal(new Set(result.numbers.map(C.key)).size,amount);
  assert.deepEqual(result.profile,P.analyze(result.numbers));
  const unique=[...new Map(saved.map(row=>[C.key(row),row])).values()];
  if(result.roundProfile)assert.deepEqual(result.roundProfile,P.analyze([...unique,...result.numbers]));
}
test('보관 번호가 없으면 기존 배치와 정확한 확률을 유지',()=>{
  for(const amount of [1,5,8,20]){
    const result=E.extend(D,[],amount,rng(amount));validate(result,[],amount);
    assert.equal(result.profile.probabilities[3].favorable,D.templates[amount].stats.favorable3);
    assert.equal(result.extension.status,'standalone');
  }
});
test('같은 회차 기존3+추가2는 전체5게임의 전역 최대를 달성하고 입력은 보존',()=>{
  const saved=disjoint(3),before=JSON.stringify(saved);
  saved.push(saved[0].slice().reverse());
  const input=JSON.stringify(saved),result=E.extend(D,saved,2,rng(28));validate(result,saved,2);
  assert.equal(JSON.stringify(saved),input);assert.equal(JSON.stringify(saved.slice(0,3)),before);
  assert.equal(result.extension.savedUnique,3);assert.equal(result.extension.globalOptimal,true);
  assert.equal(result.roundProfile.probabilities[3].favorable,966650);
  assert.equal(new Set([...saved,...result.numbers].flat()).size,30);
});
test('기존 비중복5+추가5는 기존 번호를 바꾸지 않고 최선10게임 배치를 정확히 복원',()=>{
  for(let seed=1;seed<=12;seed++){
    const random=rng(seed),saved=P.generate(D,5,random).numbers,before=JSON.stringify(saved);
    const result=E.extend(D,saved,5,random);validate(result,saved,5);
    assert.equal(JSON.stringify(saved),before);assert.equal(result.extension.status,'template-extension');
    assert.equal(result.extension.globalOptimal,false);
    assert.equal(result.roundProfile.probabilities[3].favorable,1875065);
    assert.equal(result.roundProfile.triangles,20);assert.equal(result.roundProfile.quadruples,15);
    if(seed===1)assert.equal(R.coverageExact([...saved,...result.numbers]).favorable,1875065);
  }
});
test('공통 번호가 있는 기존 부분 배치도 번호 대응을 보존해 확장',()=>{
  const saved=D.templates[10].tickets.filter((_,i)=>[0,1,2,6,7,8].includes(i)),snapshot=JSON.stringify(saved);
  const result=E.extend(D,saved,4,rng(649));validate(result,saved,4);
  assert.equal(JSON.stringify(saved),snapshot);assert.equal(result.extension.status,'template-extension');
  assert.equal(result.roundProfile.probabilities[3].favorable,1875065);
});
test('공통 교차점과 서로 다른 삼각 교차점은 같은 구조로 취급하지 않음',()=>{
  const saved=[[1,2,3,4,5,6],[1,7,8,9,10,11],[1,12,13,14,15,16]];
  const result=E.extend(D,saved,5,rng(884));validate(result,saved,5);
  assert.notEqual(result.extension.status,'template-extension');
  if(result.roundProfile)assert.equal(result.roundProfile.probabilities[3].favorable,R.coverageExact([...saved,...result.numbers]).favorable);
});
test('비선형 보관 번호에서는 전체 확률을 만들지 않고 새 묶음만 정확히 계산',()=>{
  const saved=[[1,2,3,4,5,6],[1,2,7,8,9,10]];
  const result=E.extend(D,saved,8,rng(156));validate(result,saved,8);
  assert.equal(result.roundProfile,null);assert.equal(result.extension.globalOptimal,false);
  assert.equal(result.extension.status,'overlap-fallback');
  assert.match(result.extension.reason,/계산하지 않았습니다/);
});
test('20게임을 넘는 회차와 상수 난수에서도 기존 전체와 중복 없는 선형 새 묶음 생성',()=>{
  const saved=P.generate(D,20,()=>0).numbers,before=JSON.stringify(saved);
  const result=E.extend(D,saved,20,()=>0);validate(result,saved,20);
  assert.equal(JSON.stringify(saved),before);assert.equal(result.roundProfile,null);
  assert.equal(result.extension.roundGames,40);assert.equal(result.extension.status,'overlap-fallback');
  assert(result.extension.attempts<=64);
});
test('비선형 과거 묶음에 빈 번호가 충분하면 새 번호는 모두 비중복으로 배치',()=>{
  const saved=[[1,2,3,4,5,6],[1,2,7,8,9,10]];
  const result=E.extend(D,saved,5,rng(557));validate(result,saved,5);
  assert.equal(result.extension.status,'disjoint');assert.equal(result.roundProfile,null);
  const oldNumbers=new Set(saved.flat());assert(result.numbers.flat().every(n=>!oldNumbers.has(n)));
});
test('잘못된 입력·희소 배열·잘못된 난수에 거짓 확률을 반환하지 않음',()=>{
  for(const saved of [null,Array(1),[[1,2,3,4,5,,]],[[1,2,3,4,5,46]]])assert.throws(()=>E.extend(D,saved,5,rng(1)));
  for(const amount of [0,21,1.5,NaN])assert.throws(()=>E.extend(D,[],amount,rng(1)));
  assert.throws(()=>E.extend(D,disjoint(2),3,n=>n));
});
