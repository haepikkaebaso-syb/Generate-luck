'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const R=require(String.raw`D:\로또 당첨번호 발생기\dist\research.js`);
const TOTAL=8145060,ONE3=194130,ONE4=11350,ONE5=235;
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function inspect(tickets){
 const m=tickets.length,usage=Array(45).fill(0),edge=Array.from({length:m},()=>Array(m).fill(-1));let maxOverlap=0,overlapPairs=0;
 for(const t of tickets){if(t.length!==6||new Set(t).size!==6)throw new Error('Invalid ticket');for(const n of t){if(!Number.isInteger(n)||n<1||n>45)throw new Error('Invalid number');usage[n-1]++;}}
 for(let i=0;i<m;i++)for(let j=i+1;j<m;j++){const common=tickets[i].filter(n=>tickets[j].includes(n));maxOverlap=Math.max(maxOverlap,common.length);if(common.length){overlapPairs++;edge[i][j]=edge[j][i]=common[0];}}
 const validLinear=maxOverlap<=1;let triangles=0,k4=0;
 if(validLinear){
  for(let i=0;i<m;i++)for(let j=i+1;j<m;j++)if(edge[i][j]>=0)for(let k=j+1;k<m;k++){
   const a=edge[i][j],b=edge[i][k],c=edge[j][k];if(b<0||c<0||a===b||a===c||b===c)continue;triangles++;
   for(let l=k+1;l<m;l++){const d=edge[i][l],e=edge[j][l],f=edge[k][l];if(d<0||e<0||f<0)continue;if(new Set([a,b,c,d,e,f]).size===6)k4++;}
  }
 }
 const favorable3=validLinear?m*ONE3-m*(m-1)/2*400-overlapPairs*3300+triangles*64-k4:null;
 return {m,usage,minimumUsage:Math.min(...usage),maximumUsage:Math.max(...usage),usageRange:Math.max(...usage)-Math.min(...usage),distinctNumbers:usage.filter(x=>x).length,maxPairOverlap:maxOverlap,linear:validLinear,overlappingTicketPairs:overlapPairs,bergeTriangles:triangles,bergeK4:k4,favorable3,probabilityAtLeast3:validLinear?favorable3/TOTAL:null,favorable4:validLinear?m*ONE4:null,probabilityAtLeast4:validLinear?m*ONE4/TOTAL:null,favorable5:validLinear?m*ONE5:null,probabilityAtLeast5:validLinear?m*ONE5/TOTAL:null,favorable6:m,probabilityJackpot:m/TOTAL};
}
function makeBalancedLinear(m,seed,maxSteps=80000){
 const random=rng(seed),pick=n=>Math.floor(random()*n);
 const tickets=Array.from({length:m},(_,i)=>Array.from({length:6},(_,j)=>(i*6+j)%45));
 const counts=new Uint8Array(45*45);let penalty=0;
 function removeRow(row){for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){let a=row[i],b=row[j];if(a>b)[a,b]=[b,a];const k=a*45+b;penalty-=counts[k]-1;counts[k]--;}}
 function addRow(row){for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){let a=row[i],b=row[j];if(a>b)[a,b]=[b,a];const k=a*45+b;penalty+=counts[k];counts[k]++;}}
 // Randomize a balanced incidence configuration while preserving six distinct entries per ticket.
 for(let t=0;t<m*200;t++){const i=pick(m),j=pick(m),a=pick(6),b=pick(6);if(i===j||tickets[i].includes(tickets[j][b])||tickets[j].includes(tickets[i][a]))continue;[tickets[i][a],tickets[j][b]]=[tickets[j][b],tickets[i][a]];}
 tickets.forEach(addRow);
 let steps=0;
 for(;penalty>0&&steps<maxSteps;steps++){
  const i=pick(m),j=pick(m),a=pick(6),b=pick(6);if(i===j||tickets[i].includes(tickets[j][b])||tickets[j].includes(tickets[i][a]))continue;
  const old=penalty;removeRow(tickets[i]);removeRow(tickets[j]);[tickets[i][a],tickets[j][b]]=[tickets[j][b],tickets[i][a]];addRow(tickets[i]);addRow(tickets[j]);
  const temp=.04+.9*(1-(steps%10000)/10000);
  if(penalty>old&&random()>=Math.exp((old-penalty)/temp)){removeRow(tickets[i]);removeRow(tickets[j]);[tickets[i][a],tickets[j][b]]=[tickets[j][b],tickets[i][a]];addRow(tickets[i]);addRow(tickets[j]);}
 }
 if(penalty)throw new Error('Failed to find balanced linear design m='+m+' seed='+seed);
 return {tickets:tickets.map(t=>t.map(n=>n+1).sort((a,b)=>a-b)),steps};
}
function improveLinear(input,seed,steps=2500){
 const random=rng(seed),pick=n=>Math.floor(random()*n),tickets=input.map(t=>t.slice());
 let current=inspect(tickets),accepted=0;
 for(let t=0;t<steps;t++){
  const i=pick(tickets.length),j=pick(tickets.length),a=pick(6),b=pick(6);if(i===j||tickets[i].includes(tickets[j][b])||tickets[j].includes(tickets[i][a]))continue;
  [tickets[i][a],tickets[j][b]]=[tickets[j][b],tickets[i][a]];
  const proposed=inspect(tickets);
  if(proposed.linear&&proposed.favorable3>=current.favorable3){current=proposed;accepted++;}else [tickets[i][a],tickets[j][b]]=[tickets[j][b],tickets[i][a]];
 }
 return {tickets:tickets.map(t=>t.slice().sort((a,b)=>a-b)),stats:current,accepted,steps};
}
function deterministicGraphImprovement(m){
 if(m!==10&&m!==15)return null;
 const tickets=Array.from({length:m},()=>[]);let label=1;
 const add=(a,b)=>{tickets[a].push(label);tickets[b].push(label);label++;};
 if(m===10){for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)add(a,b);}
 else {
  for(let a=0;a<7;a++)for(let b=a+1;b<7;b++)add(a,b);
  for(let a=7;a<15;a++)for(let b=a+1;b<15;b++)if(!(a%2===1&&b===a+1))add(a,b);
 }
 for(const row of tickets)while(row.length<6)row.push(label++);
 if(label!==46)throw new Error('Structured design does not use exactly45points');
 return {tickets,stats:inspect(tickets),construction:m===10?'K6 plus four isolated vertices as ticket-intersection graph':'K7 plus K8 minus a perfect matching as ticket-intersection graph',sourceSeed:null,optimizationSeed:null,independentReviewImprovement:true};
}
function main(){
 const started=Date.now(),templates={},analysis=[];const selectedCounts=new Set([8,10,15,20]);
 for(let m=1;m<=7;m++){const tickets=Array.from({length:m},(_,i)=>Array.from({length:6},(_,j)=>i*6+j+1));templates[m]={tickets,construction:'disjoint',stats:inspect(tickets)};}
 for(let m=8;m<=20;m++){
  const candidates=[];
  for(let c=0;c<20;c++){const seed=20260913+m*10000+c,made=makeBalancedLinear(m,seed),stats=inspect(made.tickets);candidates.push({seed,...made,stats});}
  candidates.sort((a,b)=>b.stats.favorable3-a.stats.favorable3||a.seed-b.seed);
  const optimized=candidates.slice(0,3).map((c,i)=>({...improveLinear(c.tickets,30300000+m*1000+i,3000),sourceSeed:c.seed,optimizationSeed:30300000+m*1000+i}));
  optimized.sort((a,b)=>b.stats.favorable3-a.stats.favorable3||a.sourceSeed-b.sourceSeed);
  let best=optimized[0];
  const exactChecks=optimized.map(candidate=>{const exact=R.coverageExact(candidate.tickets);if(exact.favorable!==candidate.stats.favorable3)throw new Error('Linear formula mismatch m='+m);return {sourceSeed:candidate.sourceSeed,optimizationSeed:candidate.optimizationSeed,exactFavorable:exact.favorable};});
  const structured=deterministicGraphImprovement(m);
  if(structured){const exact=R.coverageExact(structured.tickets);if(exact.favorable!==structured.stats.favorable3)throw new Error('Structured formula mismatch');exactChecks.push({construction:structured.construction,exactFavorable:exact.favorable});if(structured.stats.favorable3>best.stats.favorable3)best=structured;}
  const baseline=[];
  for(let b=0;b<(selectedCounts.has(m)?5:1);b++){
   const seed=20260913+m*101+b,random=rng(seed),old=R.generateDiverse({},m,[],n=>Math.floor(random()*n)),exact=R.coverageExact(old.numbers);
   baseline.push({seed,tickets:old.numbers,stats:inspect(old.numbers),exact});
  }
  const bestBaseline=Math.max(...baseline.map(b=>b.exact.favorable));
  templates[m]={tickets:best.tickets,construction:best.construction||'balanced linear incidence search, then degree-preserving nondecreasing exact-union swaps',seed:best.sourceSeed,optimizationSeed:best.optimizationSeed,stats:best.stats};
  analysis.push({m,candidateCount:20,independentReviewStructuredCandidate:structured?{construction:structured.construction,stats:structured.stats,selected:best===structured,improvementOverInitialBest:structured.stats.favorable3-optimized[0].stats.favorable3}:null,candidateCount:20,candidates:candidates.map(c=>({seed:c.seed,steps:c.steps,favorable3:c.stats.favorable3,bergeTriangles:c.stats.bergeTriangles,bergeK4:c.stats.bergeK4})),optimizedCandidates:optimized.map(c=>({sourceSeed:c.sourceSeed,optimizationSeed:c.optimizationSeed,steps:c.steps,accepted:c.accepted,stats:c.stats})),exactChecks,baseline,beatsAllSampledBaselines:best.stats.favorable3>=bestBaseline,improvementOverBestBaseline:{favorable:best.stats.favorable3-bestBaseline,probability:(best.stats.favorable3-bestBaseline)/TOTAL}});
  console.log(JSON.stringify({m,best:best.stats.favorable3,probability:best.stats.probabilityAtLeast3,p4:best.stats.probabilityAtLeast4,usage:[best.stats.minimumUsage,best.stats.maximumUsage],triangles:best.stats.bergeTriangles,k4:best.stats.bergeK4,bestBaseline,elapsedSeconds:(Date.now()-started)/1000}));
  // Save each completed size immediately for independent review.
  fs.writeFileSync(path.join(__dirname,'portfolio-templates.json'),JSON.stringify({metadata:{schemaVersion:1,referenceDate:'2026-09-13',game:'Lotto 6/45',maximumGames:20,conditions:'Unconstrained full pool 1..45 only; templates must be relabeled by a uniform permutation of all 45 numbers.',noHistoricalDrawInput:true,globalMaximumAtLeast3Claim:false,finalBoundedReviewPass:{additionalCounts:[10,15],additionalDeterministicCandidates:2,frozen:true}},templates},null,2)+'\n');
 }
 const report={metadata:{createdAtUtc:new Date().toISOString(),durationSeconds:(Date.now()-started)/1000,codeSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),researchHelperSha256:crypto.createHash('sha256').update(fs.readFileSync(String.raw`D:\로또 당첨번호 발생기\dist\research.js`)).digest('hex'),seedDescription:'Candidate seeds 20260913+10000*m+c, c=0..19; local-search seeds30300000+1000*m+i,i=0..2; baseline seeds20260913+101*m+b.'},method:{candidateCountPerM:20,exactEvaluatedPerM:3,degreePreservingLocalSearchAttemptsPerCandidate:3000,candidateQuality:'Highest exact >=3 union count among bounded candidates, local improvements, and two deterministic graph improvements found in independent review; no global optimum assertion.',finalBoundedReviewPass:{counts:[10,15],additionalCandidates:2,frozenAfterThisPass:true},formula:'m*194130 - 400*C(m,2) - 3300*overlappingTicketPairs + 64*BergeTriangles - BergeK4',independentFormulaCheck:'Each of39optimized designs and2deterministic review improvements checked against existing coverageExact enumeration.',atLeast4:'Events are pairwise disjoint when ticket overlap<=1. Exact union m*11350 reaches union-bound global maximum.',atLeast5:'Exact union m*235; same disjoint-event argument.',jackpot:'m/8145060 for every m distinct tickets, regardless of design.',randomization:'Uniform Fisher-Yates shuffle of45number labels. Map each template label through permutation; optionally uniformly shuffle ticket order. This preserves structural coverage and makes each individual ticket uniform on all C(45,6) sets. Portfolio tickets are intentionally dependent.'},analysis};
 fs.writeFileSync(path.join(__dirname,'portfolio-analysis.json'),JSON.stringify(report,null,2)+'\n');
}
module.exports={inspect,makeBalancedLinear,improveLinear,deterministicGraphImprovement};
if(require.main===module)main();
