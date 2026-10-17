'use strict';
// Research only. Fixed attempt budgets and seeds; never writes production files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('../../../dist/portfolio.js'),R=require('../../../dist/research.js');
const baselinePath=path.resolve(__dirname,'../../portfolio-templates.json');
const BASE=JSON.parse(fs.readFileSync(baselinePath,'utf8')),TOTAL=8145060;
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function state(input){
 const rows=input.map(row=>row.slice()),m=rows.length,owners=Array.from({length:46},()=>[]),edges=new Int8Array(m*m);
 rows.forEach((row,i)=>row.forEach(label=>owners[label].push(i)));
 for(let label=1;label<=45;label++)for(let a=0;a<owners[label].length;a++)for(let b=a+1;b<owners[label].length;b++){
  const i=owners[label][a],j=owners[label][b];if(edges[i*m+j])throw new Error('Nonlinear input');edges[i*m+j]=edges[j*m+i]=label;
 }
 return {rows,m,owners,edges};
}
function objective(s){
 const {m,edges:e}=s;let triangles=0,quadruples=0;
 for(let i=0;i<m;i++)for(let j=i+1;j<m;j++){
  const a=e[i*m+j];if(!a)continue;
  for(let k=j+1;k<m;k++){
   const b=e[i*m+k],c=e[j*m+k];if(!b||!c||a===b||a===c||b===c)continue;triangles++;
   for(let l=k+1;l<m;l++){
    const d=e[i*m+l],f=e[j*m+l],g=e[k*m+l];
    if(d&&f&&g&&d!==a&&d!==b&&d!==c&&f!==a&&f!==b&&f!==c&&g!==a&&g!==b&&g!==c&&d!==f&&d!==g&&f!==g)quadruples++;
   }
  }
 }
 return 64*triangles-quadruples;
}
function search(input,seed,budget,shake=false,onBest=()=>{}){
 const random=rng(seed),pick=n=>Math.floor(random()*n);let s=state(input),current=objective(s),bestScore=current,best=s.rows.map(r=>r.slice());
 const {m,edges,owners,rows}=s,stamp=new Int32Array(m*m);let serial=0,valid=0,accepted=0,threeAccepted=0;
 for(let attempt=0;attempt<budget;attempt++){
  const n=random()<.28?3:2,indices=[],slots=[],labels=[];
  for(let q=0;q<n;q++){indices.push(pick(m));slots.push(pick(6));labels.push(rows[indices[q]][slots[q]]);}
  if(new Set(indices).size!==n||new Set(labels).size!==n)continue;
  let legal=true;
  for(let q=0;q<n;q++)if(rows[indices[q]].includes(labels[(q+1)%n])){legal=false;break;}
  if(!legal)continue;
  const newOwners=labels.map((label,q)=>owners[label].map(row=>row===indices[q]?indices[(q+n-1)%n]:row));
  const changed=[],old=[];serial++;
  function set(i,j,value){
   if(i>j)[i,j]=[j,i];const k=i*m+j;
   if(stamp[k]!==serial){stamp[k]=serial;changed.push(k);old.push(edges[k]);}
   edges[k]=edges[j*m+i]=value;
  }
  function restore(){for(let z=0;z<changed.length;z++){const k=changed[z],i=Math.floor(k/m),j=k%m;edges[k]=edges[j*m+i]=old[z];}}
  for(const label of labels){const list=owners[label];for(let a=0;a<list.length;a++)for(let b=a+1;b<list.length;b++)set(list[a],list[b],0);}
  for(let q=0;q<n&&legal;q++){
   const list=newOwners[q];for(let a=0;a<list.length&&legal;a++)for(let b=a+1;b<list.length;b++){
    if(edges[list[a]*m+list[b]]){legal=false;break;}set(list[a],list[b],labels[q]);
   }
  }
  if(!legal){restore();continue;}valid++;
  const next=objective(s),phase=attempt%250000;
  const temperature=shake&&attempt<15000?1500:3+250*(1-phase/250000)**2;
  if(next>=current||random()<Math.exp((next-current)/temperature)){
   for(let q=0;q<n;q++){rows[indices[q]][slots[q]]=labels[(q+1)%n];owners[labels[q]]=newOwners[q];}
   current=next;accepted++;if(n===3)threeAccepted++;
   if(next>bestScore){bestScore=next;best=rows.map(r=>r.slice());onBest(best,bestScore,{attempt:attempt+1,seed});}
  }else restore();
 }
 const exact=P.analyze(best),base=P.analyze(input);
 if(exact.probabilities[3].favorable-base.probabilities[3].favorable!==bestScore-objective(state(input)))throw new Error('Objective mismatch');
 return {tickets:best.map(r=>r.slice().sort((a,b)=>a-b)),objective:bestScore,seed,budget,valid,accepted,threeAccepted,shake,analysis:exact};
}
const args=process.argv.slice(2),only=args.length?args.map(Number):Array.from({length:12},(_,i)=>i+9);
const results=[],started=Date.now();
const metadata={baselineSha256:crypto.createHash('sha256').update(fs.readFileSync(baselinePath)).digest('hex'),scriptSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),method:'Fixed-budget multi-seed simulated annealing with 28% three-row cyclic incidence moves;45label usages preserved, row pair linearity enforced by incremental edge updates; exact64T-Q objective. No global optimum assertion.'};
function save(){fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({metadata,durationSeconds:(Date.now()-started)/1000,results},null,2)+'\n');}
for(const m of only){
 const original=BASE.templates[m].tickets,baseline=P.analyze(original).probabilities[3].favorable;
 let best=original,bestFavorable=baseline;const runs=[];
 const seeds=m<=15?2:m===16?4:6,budget=m<=15?400000:m===16?750000:1000000;
 const result={games:m,baselineFavorable:baseline,baselineProbability:baseline/TOTAL,candidateFavorable:baseline,gain:0,runs,tickets:original};results.push(result);
 for(let index=0;index<seeds;index++){
  const seed=2026101800+m*100+index,shake=index%2===1;
  const initial=index%3===2?original:best;
  const run=search(initial,seed,budget,shake,(rows,value,found)=>{
   const p=P.analyze(rows),favorable=p.probabilities[3].favorable;
   if(favorable<=bestFavorable)return;
   bestFavorable=favorable;best=rows.map(r=>r.slice());
   Object.assign(result,{candidateFavorable:favorable,gain:favorable-baseline,gainPercentagePoints:100*(favorable-baseline)/TOTAL,candidateProbability:favorable/TOTAL,tickets:best,analysis:p,discovery:found});
   console.log(JSON.stringify({event:'strict-improvement',games:m,gain:result.gain,favorable,seed,attempt:found.attempt,elapsedSeconds:(Date.now()-started)/1000}));save();
  });
  runs.push({seed,budget,shake,startingFavorable:P.analyze(initial).probabilities[3].favorable,endingFavorable:run.analysis.probabilities[3].favorable,valid:run.valid,accepted:run.accepted,threeAccepted:run.threeAccepted});
  if(run.analysis.probabilities[3].favorable>bestFavorable){best=run.tickets;bestFavorable=run.analysis.probabilities[3].favorable;}
  console.log(JSON.stringify({event:'seed-complete',games:m,index,seed,budget,bestGain:bestFavorable-baseline,elapsedSeconds:(Date.now()-started)/1000}));save();
 }
 Object.assign(result,{candidateFavorable:bestFavorable,gain:bestFavorable-baseline,gainPercentagePoints:100*(bestFavorable-baseline)/TOTAL,candidateProbability:bestFavorable/TOTAL,tickets:best,analysis:P.analyze(best)});
 const exact=R.coverageExact(best);if(exact.favorable!==bestFavorable)throw new Error('Independent bitset enumeration mismatch');result.independentExact=exact;save();
 console.log(JSON.stringify({event:'count-complete',games:m,gain:result.gain,independentVerified:true,elapsedSeconds:(Date.now()-started)/1000}));
}
