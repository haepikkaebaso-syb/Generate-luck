'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../data/jackpot-research/filter-comparison.json'),{draws}=require('../data/draws.json');
function choose(n,k){let value=1;for(let i=1;i<=k;i++)value=value*(n-i+1)/i;return Math.round(value);}
test('기존 조건의 역사 적중수와 홀짝 조합수를 별도 식으로 대조',()=>{
  for(const f of F.filters){
    const o=f.options,count=draws.filter(d=>{const sum=d.numbers.reduce((a,b)=>a+b,0),odd=d.numbers.filter(n=>n%2).length;return sum>=(o.minSum??21)&&sum<=(o.maxSum??255)&&odd>=(o.minOdd??0)&&odd<=(o.maxOdd??6);}).length;
    assert.equal(f.observedDraws,count);assert.equal(f.fairFiveDistinctInsideTypeProbability,5/8145060);
  }
  assert.equal(F.filters.find(f=>f.id==='odd3').possibleCombinations,choose(23,3)*choose(22,3));
  assert.equal(F.filters.find(f=>f.id==='odd2to4').possibleCombinations,[2,3,4].reduce((s,k)=>s+choose(23,k)*choose(22,6-k),0));
});
test('합계·홀짝 결합 조건의 경우의 수를 독립 부분집합 DP로 대조',()=>{
  let states=new Map([['0,0,0',1]]);
  for(let number=1;number<=45;number++){
    const next=new Map(states);
    for(const [key,count] of states){const [k,sum,odd]=key.split(',').map(Number);if(k>=6||sum+number>180)continue;const target=[k+1,sum+number,odd+number%2].join(',');next.set(target,(next.get(target)||0)+count);}
    states=next;
  }
  for(const id of ['sum100to180','oldBalanced']){
    const expected=F.filters.find(f=>f.id===id);let total=0;
    for(const [key,count] of states){const [k,sum,odd]=key.split(',').map(Number);if(k===6&&sum>=100&&sum<=180&&(id!=='oldBalanced'||odd>=2&&odd<=4))total+=count;}
    assert.equal(total,expected.possibleCombinations);
  }
});
