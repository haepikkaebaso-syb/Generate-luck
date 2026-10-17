'use strict';
// Independent mathematical audit. Does not mutate any app source or templates.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const exact = require('../../dist/research.js').coverageExact;
const analyze = require('../../dist/portfolio.js').analyze;
const templates = require('../portfolio-templates.json').templates;

function combinations(n, k, start = 0, prefix = [], out = []) {
  if (!k) { out.push(prefix.slice()); return out; }
  for (let x = start; x <= n-k; x++) {
    prefix.push(x); combinations(n,k-1,x+1,prefix,out); prefix.pop();
  }
  return out;
}
function popcount(x) { let n=0; while(x){x&=x-1;n++;} return n; }

// Exhaust every 3-ticket portfolio in a 7-number toy lottery, every applicable
// split of a shared label into a globally unused label, and all 3-number draws.
function exhaustiveToyAudit() {
  const masks=combinations(7,3).map(a=>a.reduce((m,x)=>m|(1<<x),0));
  const cache=new Map();
  function count(rows) {
    const key=rows.slice().sort((a,b)=>a-b).join(',');
    if(cache.has(key))return cache.get(key);
    const result=masks.filter(draw=>rows.some(row=>popcount(row&draw)>=2)).length;
    cache.set(key,result);return result;
  }
  let portfolios=0,transforms=0,strictImprovements=0;
  for(const ids of combinations(masks.length,3)){
    portfolios++;
    const rows=ids.map(i=>masks[i]), used=rows.reduce((a,b)=>a|b,0),before=count(rows);
    for(let x=0;x<7;x++){
      const carriers=[0,1,2].filter(i=>rows[i]&(1<<x));
      if(carriers.length<2)continue;
      for(let y=0;y<7;y++)if(!(used&(1<<y))){
        for(let selection=1;selection<(1<<carriers.length)-1;selection++){
          const changed=rows.slice();
          for(let j=0;j<carriers.length;j++)if(selection&(1<<j)){
            changed[carriers[j]]^=(1<<x)|(1<<y);
          }
          const after=count(changed);assert(after>=before);
          transforms++;if(after>before)strictImprovements++;
        }
      }
    }
  }
  return {universe:7,ticketSize:3,drawSize:3,threshold:2,portfolios,transforms,strictImprovements};
}

function actualSplitAudit() {
  const rows=[[1,2,3,4,5,6],[1,2,7,8,9,10],[1,3,7,11,12,13],
    [2,4,8,11,14,15],[3,5,9,12,14,16]];
  const steps=[{tickets:rows.map(r=>r.slice()),favorable:exact(rows).favorable}];
  while(new Set(rows.flat()).size<30){
    const used=new Set(rows.flat());
    const x=Array.from(used).sort((a,b)=>a-b).find(v=>rows.filter(r=>r.includes(v)).length>1);
    const y=Array.from({length:45},(_,i)=>i+1).find(v=>!used.has(v));
    const carrier=rows.findIndex(r=>r.includes(x));
    rows[carrier][rows[carrier].indexOf(x)]=y;
    rows[carrier].sort((a,b)=>a-b);
    const favorable=exact(rows).favorable;
    assert(favorable>=steps.at(-1).favorable);
    steps.push({replace:{ticket:carrier,from:x,to:y},favorable});
  }
  assert.equal(steps.at(-1).favorable,5*194130-400*10);
  return {steps,finalTickets:rows};
}

function buildFivePlusFive() {
  const existing=Array.from({length:5},(_,i)=>Array.from({length:6},(_,j)=>6*i+j+1));
  const added=Array.from({length:5},(_,i)=>[i+1]);
  let label=31;
  for(let i=0;i<5;i++)for(let j=i+1;j<5;j++){
    added[i].push(label);added[j].push(label++);
  }
  for(let i=0;i<5;i++)added[i].push(label++);
  assert.equal(label,46);
  const combined=[...existing,...added];
  const calculated=analyze(combined),verified=exact(combined);
  assert.equal(calculated.probabilities[3].favorable,verified.favorable);
  assert.equal(verified.favorable,analyze(templates[10].tickets).probabilities[3].favorable);
  return {existing,added,stats:calculated,verified};
}

// Splitting reduces an 8-ticket optimum to all45 labels used. The excess
// incidence budget48-45=3 has partitions1+1+1,2+1,3. These are all12
// unlabeled shared-support shapes (including nonlinear repeated pair edges).
function allEightGameSharedShapes() {
  const cases=[
    ['three pairs: matching',[[0,1],[2,3],[4,5]]],
    ['three pairs: wedge plus edge',[[0,1],[1,2],[3,4]]],
    ['three pairs: path',[[0,1],[1,2],[2,3]]],
    ['three pairs: star',[[0,1],[0,2],[0,3]]],
    ['three pairs: triangle',[[0,1],[1,2],[0,2]]],
    ['three pairs: double edge plus separate edge',[[0,1],[0,1],[2,3]]],
    ['three pairs: double edge plus adjacent edge',[[0,1],[0,1],[1,2]]],
    ['three pairs: triple edge',[[0,1],[0,1],[0,1]]],
    ['triple and pair: disjoint',[[0,1,2],[3,4]]],
    ['triple and pair: one shared ticket',[[0,1,2],[0,3]]],
    ['triple and pair: two shared tickets',[[0,1,2],[0,1]]],
    ['one quadruple',[[0,1,2,3]]]
  ];
  const results=cases.map(([name,supports])=>{
    const rows=Array.from({length:8},()=>[]);let label=1;
    for(const support of supports){for(const i of support)rows[i].push(label);label++;}
    for(const row of rows)while(row.length<6)row.push(label++);
    assert.equal(label,46);
    return {name,supports,tickets:rows,...exact(rows)};
  });
  const maximum=Math.max(...results.map(r=>r.favorable));
  assert.equal(maximum,analyze(templates[8].tickets).probabilities[3].favorable);
  return {maximum,probability:maximum/8145060,results};
}

const p5=(5*194130-400*10)/8145060;
const result={
  scope:'New proof and independent audit only; fair uniform Lotto6/45, >=3 main matches. No app edits.',
  theorem:'Splitting a shared label into a globally unused label never decreases probability of at least one ticket reaching a common hit threshold. If 6m<=45, repeated splits prove disjoint tickets globally optimal.',
  maxima:Array.from({length:7},(_,i)=>{const m=i+1,favorable=m*194130-400*m*(m-1)/2;return {games:m,favorable,probability:favorable/8145060};}),
  exhaustiveToyAudit:exhaustiveToyAudit(),
  actualSplitAudit:actualSplitAudit(),
  savedFivePlusAddedFive:buildFivePlusFive(),
  eightGameAllSharedShapes:allEightGameSharedShapes(),
  twoBlockExactDuplicateRejectionBound:{
    rejectionProbabilityAtMost:25/8145060,
    averageDifferencePercentagePointsAtMost:100*25/8145060,
    explanation:'For a fixed disjoint first5 and independently uniformly relabeled second5, each of25 possible row equalities has probability1/N. Conditioning the second block on no exact duplicates changes expected union probability by at most the rejection probability. Applies with popular-number filtering disabled.'
  },
  independentFiveBlockComparison:[2,3,4].map(b=>{
    const independentAverage=1-(1-p5)**b;
    const joint=analyze(templates[5*b].tickets).probabilities[3].probability;
    return {blocks:b,games:5*b,independentAverage,currentJointTemplate:joint,differencePercentagePoints:100*(joint-independentAverage)};
  }),
  caveats:[
    'Independent-block averages assume independent uniformly relabeled blocks, BEFORE saved exact-duplicate rejection or popular-number filtering; they are not an exact average of all current app modes.',
    'Exact extension comparison concerns a specified fixed portfolio; any disjoint saved five can be mapped to the example by a label permutation.',
    'The splitting argument directly proves1..7;8 is additionally resolved by a complete12-shape classification. No global claim is made for9 or more.',
    'At least one prize probability is not expected prize count, profit, or jackpot probability.'
  ]
};
const target=path.join(__dirname,'splitting-optimality-20261018.json');
fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({maxima:result.maxima,toy:result.exhaustiveToyAudit,splitCounts:result.actualSplitAudit.steps.map(s=>s.favorable),extension:result.savedFivePlusAddedFive.verified,eightGames:result.eightGameAllSharedShapes.results.map(({name,favorable})=>({name,favorable})),blocks:result.independentFiveBlockComparison},null,2));
