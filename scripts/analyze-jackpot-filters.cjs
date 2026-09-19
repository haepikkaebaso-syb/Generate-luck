'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),C=require('../dist/core.js');
const bytes=fs.readFileSync(path.join(root,'data/draws.json')),data=JSON.parse(bytes);
// Previously used UI conditions, fixed here for descriptive illustration.
// These are not additional model candidates or a search for an optimal filter.
const specifications=[
  {id:'odd3',label:'홀수3개·짝수3개',options:{minOdd:3,maxOdd:3}},
  {id:'odd2to4',label:'홀수2~4개',options:{minOdd:2,maxOdd:4}},
  {id:'sum100to180',label:'합계100~180',options:{minSum:100,maxSum:180}},
  {id:'oldBalanced',label:'합계100~180이고 홀수2~4개',options:{minSum:100,maxSum:180,minOdd:2,maxOdd:4}}
];
const z=1.959963984540054;
function wilson(count,n){const p=count/n,d=1+z*z/n,center=(p+z*z/(2*n))/d,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [center-half,center+half];}
const result={schemaVersion:1,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),drawCount:data.draws.length,totalCombinations:C.TOTAL,exploratory:true,independentFreshTest:false,method:'Exact constrained combination count with LottoCore.createSpace; each draw counted once; pre-existing UI filters only.',filters:specifications.map(spec=>{
  const space=C.createSpace(spec.options),matches=data.draws.filter(d=>space.rankOf(d.numbers)>=0),p=matches.length/data.draws.length,q=space.total/C.TOTAL;
  return {...spec,possibleCombinations:space.total,fairTypeProbability:q,observedDraws:matches.length,observedRate:p,expectedDraws:data.draws.length*q,historicalEnrichment:p/q,descriptiveWilson95:wilson(matches.length,data.draws.length),fairSingleTicketProbability:1/C.TOTAL,fairFiveDistinctInsideTypeProbability:5/C.TOTAL,rawEmpiricalWithinTypeTicketProbability:p/space.total,exampleRounds:matches.slice(0,3).map(({round,date,numbers})=>({round,date,numbers}))};
}),limitations:['The four filters overlap; frequencies and Wilson intervals are descriptive, not simultaneous inference or future prediction guarantees.','The naive observed-rate/cardinality is shown only to distinguish type frequency and per-combination probability, not recommended as a forecast.','For five fixed distinct tickets in a category, fair jackpot probability = P(category)*5/categorySize =5/8145060. Conditioning on the category actually winning in hindsight omits its failure probability.']};
fs.mkdirSync(path.join(root,'data/jackpot-research'),{recursive:true});
fs.writeFileSync(path.join(root,'data/jackpot-research/filter-comparison.json'),JSON.stringify(result,null,2)+'\n');
console.log('Exact counts for four fixed historical filters written.');
