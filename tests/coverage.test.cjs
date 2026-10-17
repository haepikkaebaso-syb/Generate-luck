'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const X=require('../dist/coverage.js'),R=require('../dist/research.js'),D=require('../data/portfolio-templates.json');
const choose=(n,k)=>{let value=1;for(let i=1;i<=k;i++)value=value*(n-i+1)/i;return value;};
function combinations(n,k,limit=Infinity){
  const rows=[],row=[];
  function visit(start,left){
    if(rows.length>=limit)return;
    if(!left){rows.push(row.slice());return;}
    for(let i=start;i<=n-left+1;i++){row.push(i);visit(i+1,left-1);row.pop();if(rows.length>=limit)return;}
  }
  visit(1,k);return rows;
}
function sameCoverage(actual,expected){
  for(const key of ['favorable','total','probability','uniqueGames','jackpot'])assert.equal(actual[key],expected[key],key);
  assert(Math.abs(actual.randomBaseline-expected.randomBaseline)<2e-14);
}
test('빈 조합·한 게임·기존 20게임 배치의 정확 확률',()=>{
  sameCoverage(X.coverageExact([]),R.coverageExact([]));
  const one=X.coverageExact([[45,4,19,2,37,8]]);
  assert.equal(one.favorable,194130);assert.equal(one.total,8145060);assert.equal(one.uniqueGames,1);
  for(const amount of [5,8,16,20])sameCoverage(X.coverageExact(D.templates[amount].tickets),R.coverageExact(D.templates[amount].tickets));
});
test('비선형·무작위 조합을 독립 연구용 비트집합 계산과 대조',()=>{
  const random=R.seededRandom(892713);
  const portfolios=[[[1,2,3,4,5,6],[1,2,3,7,8,9],[1,2,4,7,10,45],[2,3,4,11,12,13]],combinations(8,6,12)];
  for(const amount of [2,7,20]){
    const rows=[];
    for(let i=0;i<amount;i++){const pool=Array.from({length:45},(_,j)=>j+1);for(let j=44;j>0;j--){const k=Math.floor(random()*(j+1));[pool[j],pool[k]]=[pool[k],pool[j]];}rows.push(pool.slice(0,6));}
    portfolios.push(rows);
  }
  for(const rows of portfolios)sameCoverage(X.coverageExact(rows),R.coverageExact(rows));
});
test('저장 맥락을 재사용해도 후보끼리 오염되지 않고 중복 조합을 한 번만 계산',()=>{
  const saved=[[6,5,4,3,2,1],[1,2,3,4,5,6],[1,2,7,8,9,10]],snapshot=JSON.stringify(saved);
  const a=[[10,9,8,7,2,1],[1,2,11,12,13,14],[14,13,12,11,2,1]],b=[[1,3,15,16,17,18]];
  const context=X.createContext(saved),baseline={...context.baseline};
  for(const rows of [a,b,[],a]){
    const before=JSON.stringify(rows),actual=context.evaluate(rows);
    sameCoverage(actual,R.coverageExact(saved.concat(rows)));
    assert.equal(actual.baselineGames,2);assert.equal(actual.addedUnique,rows.length ? 1 : 0);
    assert.equal(actual.newFavorable,actual.favorable-context.baseline.favorable);
    assert.equal(JSON.stringify(rows),before);
  }
  assert.deepEqual(context.baseline,baseline);assert.equal(JSON.stringify(saved),snapshot);
  assert.equal(X.coverageExact(Array(200).fill(saved[0])).uniqueGames,1);
});
test('20게임을 넘는 비선형 28·84게임: 번호 풀의 조합식으로 독립 검증',()=>{
  for(const poolSize of [8,9]){
    const rows=combinations(poolSize,6),half=rows.length/2;
    assert.equal(rows.length,poolSize===8 ? 28 : 84);
    let expected=0;for(let hits=3;hits<=6;hits++)expected+=choose(poolSize,hits)*choose(45-poolSize,6-hits);
    assert.equal(X.coverageExact(rows).favorable,expected);
    const context=X.createContext(rows.slice(0,half)),result=context.evaluate(rows.slice(half));
    assert.equal(result.favorable,expected);assert.equal(result.uniqueGames,rows.length);assert.equal(result.addedUnique,half);
    assert.equal(result.jackpot,rows.length/X.TOTAL);
  }
});
test('200게임 지원과 합산 상한을 검증하고 입력 오류를 거절',()=>{
  const rows=combinations(12,6,201);
  const context=X.createContext(rows.slice(0,200));
  assert.equal(context.baseline.uniqueGames,200);
  assert.equal(context.evaluate(rows.slice(0,20)).addedUnique,0);
  assert.throws(()=>context.evaluate([rows[200]]),/200/);
  assert.throws(()=>X.coverageExact(rows),/200/);
  for(const input of [null,{},Array(1),[[1,2,3,4,5,,]],[[1,2,3,4,5]],[[1,2,3,4,5,5]],[[0,1,2,3,4,5]],[[1,2,3,4,5,46]],[[1,2,3,4,5,6.1]],[[1,2,3,4,5,'6']]]){
    assert.throws(()=>X.coverageExact(input));assert.throws(()=>X.createContext().evaluate(input));
  }
});
test('단독 함수 직렬화와 브라우저 전역에서 같은 결과 제공',()=>{
  const standalone=vm.runInNewContext('('+X.createContext.toString()+')');
  const expected=X.coverageExact([[1,2,3,4,5,6],[1,2,7,8,9,10]]);
  sameCoverage(standalone([[1,2,3,4,5,6]]).evaluate([[1,2,7,8,9,10]]),expected);
  const scope={window:{}};
  vm.runInNewContext(require('node:fs').readFileSync(require.resolve('../dist/coverage.js'),'utf8'),scope);
  sameCoverage(scope.window.LottoCoverage.coverageExact([[1,2,3,4,5,6],[1,2,7,8,9,10]]),expected);
});
