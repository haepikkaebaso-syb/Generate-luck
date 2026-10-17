'use strict';
// Bounded research only: never rewrites production templates.
const fs=require('node:fs'),path=require('node:path');
const P=require('../../dist/portfolio.js'),R=require('../../dist/research.js');
const D=require('./portfolio-templates-20260913.json'),TOTAL=8145060;
function rng(seed){let s=seed>>>0;return()=>{s+=0x6d2b79f5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function graphCandidate(m){
 if(![11,12,13,14].includes(m))return null;
 const rows=Array.from({length:m},()=>[]);let n=1;
 const edge=(i,j)=>{rows[i].push(n);rows[j].push(n++);};
 for(let i=0;i<7;i++)for(let j=i+1;j<7;j++)edge(i,j);
 if(m===12)for(let i=7;i<11;i++)for(let j=i+1;j<11;j++)edge(i,j);
 if(m===13||m===14)for(let i=7;i<m;i++)for(let j=i+1;j<m;j++)if(!(i===7&&j>=m-3))edge(i,j);
 for(const row of rows)while(row.length<6)row.push(n++);
 if(n!==46)throw new Error('Unexpected graph label count');
 return rows;
}
// Exact formula only for linear incidence portfolios; no Monte Carlo objective.
function score(rows){
 const m=rows.length,e=Array.from({length:m},()=>new Int8Array(m));let pairs=0,tri=0,k4=0;
 for(let i=0;i<m;i++)for(let j=i+1;j<m;j++){
  let common=0;for(let k=0;k<6;k++)if(rows[j].includes(rows[i][k])){if(common)return null;common=rows[i][k];}
  if(common){e[i][j]=e[j][i]=common;pairs++;}
 }
 for(let i=0;i<m;i++)for(let j=i+1;j<m;j++)if(e[i][j])for(let k=j+1;k<m;k++){
  const a=e[i][j],b=e[i][k],c=e[j][k];if(!b||!c||a===b||a===c||b===c)continue;tri++;
  for(let l=k+1;l<m;l++){const d=e[i][l],f=e[j][l],g=e[k][l];if(d&&f&&g&&new Set([a,b,c,d,f,g]).size===6)k4++;}
 }
 return m*194130-400*m*(m-1)/2-3300*pairs+64*tri-k4;
}
const results=[],started=Date.now();
for(let m=8;m<=20;m++){
 const old=D.templates[m].tickets.map(t=>t.slice()),base=P.analyze(old).probabilities[3].favorable;
 let best=graphCandidate(m)||old.map(t=>t.slice()),bestScore=score(best),rows=best.map(t=>t.slice()),current=bestScore;
 if(bestScore<base){best=old.map(t=>t.slice());bestScore=base;rows=best.map(t=>t.slice());current=base;}
 const seed=20261018+m*10000,random=rng(seed),pick=n=>Math.floor(random()*n),deadline=Date.now()+7000;
 let attempts=0,valid=0,accepted=0;
 while(Date.now()<deadline){
  attempts++;
  // Restart from best regularly; permit temporary losses of triangle score.
  if(attempts%10000===0){rows=best.map(t=>t.slice());current=bestScore;}
  const i=pick(m),j=pick(m),a=pick(6),b=pick(6);
  if(i===j||rows[i].includes(rows[j][b])||rows[j].includes(rows[i][a]))continue;
  [rows[i][a],rows[j][b]]=[rows[j][b],rows[i][a]];
  const value=score(rows);if(value!==null)valid++;
  const temp=1+80*(1-(attempts%10000)/10000);
  if(value!==null&&(value>=current||random()<Math.exp((value-current)/temp))){current=value;accepted++;if(value>bestScore){bestScore=value;best=rows.map(t=>t.slice());}}
  else [rows[i][a],rows[j][b]]=[rows[j][b],rows[i][a]];
 }
 best=best.map(t=>t.slice().sort((a,b)=>a-b));
 const analysis=P.analyze(best);if(analysis.probabilities[3].favorable!==bestScore)throw new Error('Formula disagreement');
 const result={games:m,seed,attempts,valid,accepted,baselineFavorable:base,candidateFavorable:bestScore,gain:bestScore-base,gainPercentagePoints:100*(bestScore-base)/TOTAL,baselineProbability:base/TOTAL,candidateProbability:bestScore/TOTAL,construction:graphCandidate(m)?'K7 and residual graph; bounded swaps thereafter':'Existing template; bounded label-incidence swaps',tickets:best,analysis};
 // Independent bitset enumeration for every strict improvement.
 if(bestScore>base){const exact=R.coverageExact(best);if(exact.favorable!==bestScore)throw new Error('Independent enumeration disagrees');result.independentExact=exact;}
 results.push(result);console.log(JSON.stringify({m,gain:result.gain,before:result.baselineProbability,after:result.candidateProbability,attempts,independentVerified:!!result.independentExact}));
 fs.writeFileSync(path.join(__dirname,'targeted-search-20261018.json'),JSON.stringify({method:'7 seconds per count 8..20, fixed seeds but wall-clock attempt budget; exact objective, independent exhaustive verification of strict improvements; no global optimum assertion for m>=8',durationSeconds:(Date.now()-started)/1000,results},null,2)+'\n');
}
