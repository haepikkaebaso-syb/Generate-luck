'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../dist/core.js'),P=require('../dist/portfolio.js'),R=require('../dist/research.js'),D=require('../data/portfolio-templates.json');
const close=(a,b,t=1e-12)=>assert(Math.abs(a-b)<=t,`${a} != ${b}`);
test('확정20개 배치: 독립 비트집합 열거와 모든 당첨 영역 일치',()=>{
  const audited=require('../data/portfolio-research/proposed-template-verification.json');
  for(let m=1;m<=20;m++){
    const t=D.templates[m],a=P.analyze(t.tickets),expected=R.coverageExact(t.tickets);
    assert.equal(a.games,m);assert.equal(a.probabilities[3].favorable,expected.favorable);assert.equal(a.probabilities[3].favorable,t.stats.favorable3);
    assert(a.maxOverlap<=1);assert(a.maximumUsage-a.minimumUsage<=1);assert.equal(a.distinctNumbers,Math.min(45,m*6));
    for(const k of [4,5,6])assert.equal(a.probabilities[k].favorable,m*P.ONE[k]);
    const independent=audited.results.find(r=>r.games===m);
    if(independent)for(const k of [3,4,5,6])assert.equal(a.probabilities[k].favorable,independent.counts[k]);
    assert(a.probabilities[3].probability>=a.probabilities[3].randomBaseline-1e-12);
  }
});
test('전체 번호의 무작위 치환100회가 당첨 영역과 균형을 보존',()=>{
  const rand=R.seededRandom(45645),rng=bound=>Math.floor(rand()*bound);
  for(let seed=0;seed<100;seed++){
    const m=seed%20+1,result=P.generate(D,m,rng);
    assert.equal(result.numbers.length,m);assert.equal(new Set(result.numbers.map(C.key)).size,m);
    assert(result.numbers.every(t=>C.validNumbers(t,6)));assert.equal(result.profile.probabilities[3].favorable,D.templates[m].stats.favorable3);
    for(const row of result.numbers)assert.deepEqual(row,[...row].sort((a,b)=>a-b));
  }
});
test('삼중·사중 교차점 및 같은 교차점을 공유하는 구조를 정확식과 독립 열거 대조',()=>{
  const hub=[[1,2,3,4,5,6],[1,7,8,9,10,11],[1,12,13,14,15,16]];
  const triangle=[[1,2,4,5,6,7],[1,3,8,9,10,11],[2,3,12,13,14,15]];
  const k4=[[1,2,3,7,8,9],[1,4,5,10,11,12],[2,4,6,13,14,15],[3,5,6,16,17,18]];
  assert.equal(P.analyze(hub).triangles,0);assert.equal(P.analyze(triangle).triangles,1);assert.equal(P.analyze(k4).quadruples,1);
  for(const t of [hub,triangle,k4])assert.equal(P.analyze(t).probabilities[3].favorable,R.coverageExact(t).favorable);
});
test('무작위 비복원 기준을 BigInt 조합비로 대조: 모든게임수·등위',()=>{
  for(let m=1;m<=20;m++)for(const hits of [3,4,5,6]){
    let bad=1n,total=1n;
    for(let i=0;i<m;i++){bad*=BigInt(C.TOTAL-P.ONE[hits]-i);total*=BigInt(C.TOTAL-i);}
    close(P.randomBaseline(m,hits),Number(total-bad)/Number(total),2e-15);
  }
  close(P.randomBaseline(5,6),5/C.TOTAL,1e-20);
});
test('부적합·희소 배열·지원하지 않는 겹침에는 확률을 반환하지 않음',()=>{
  for(const v of [[],Array(1),[[1,2,3,4,5,,]],[[1,2,3,4,5,6],[1,2,3,4,5,6]],[[1,2,3,4,5,6],[1,2,7,8,9,10]],[[0,1,2,3,4,5]],Array(21).fill([1,2,3,4,5,6])])assert.throws(()=>P.analyze(v));
  assert.equal(C.validNumbers([1,2,3,4,5,,],6),false);
  for(const m of [0,21,1.5,NaN])assert.throws(()=>P.generate(D,m));
  assert.throws(()=>P.generate(D,5,b=>b));assert.throws(()=>P.randomBaseline(5,2));
});
test('확정 설계와 검증 원본 해시, 감사한 실제 생성 엔진 일치',()=>{
  const root=path.resolve(__dirname,'..'),digest=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
  for(const f of require('../data/portfolio-provenance.json').files)assert.equal(digest(f.path),f.sha256,f.path);
  assert.equal(digest('data/portfolio-templates.json'),'87fe730ca517af8e6137d88e65132ac57e9493cf85c65f8f039e1e53dc799312');
  assert.equal(digest('dist/portfolio.js'),'c15e708854ee0e010273bd84b45188973b2ec2c21468d35a4803605cf7ae32c9');
  assert.equal(digest('dist/core.js'),'e8aa26ad134bef0f100bbcfb595ad090559fff3d9ba9ab300963b811e43f0d04');
});
