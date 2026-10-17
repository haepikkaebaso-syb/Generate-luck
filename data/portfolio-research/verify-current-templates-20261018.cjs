'use strict';
// Independent enumerator: no production probability formula or research helper.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),templatePath=path.join(root,'data/portfolio-templates.json');
const document=JSON.parse(fs.readFileSync(templatePath,'utf8')),TOTAL=8145060;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const choose=Array.from({length:46},()=>Array(7).fill(0));
for(let n=0;n<=45;n++){choose[n][0]=1;for(let k=1;k<=6;k++)choose[n][k]=n?choose[n-1][k]+choose[n-1][k-1]:0;}
function subsets(pool,size){
 const result=[],selected=[];
 function visit(start,left){if(!left){result.push(selected.slice());return;}for(let i=start;i<=pool.length-left;i++){selected.push(pool[i]);visit(i+1,left-1);selected.pop();}}
 visit(0,size);return result;
}
function verify(tickets){
 const maxima=new Uint8Array(TOTAL);
 for(const input of tickets){
  const ticket=input.slice().sort((a,b)=>a-b),outside=Array.from({length:45},(_,i)=>i+1).filter(v=>!ticket.includes(v));
  assert.equal(new Set(ticket).size,6);assert(ticket.every(n=>Number.isInteger(n)&&n>=1&&n<=45));
  // Enumerate every draw that matches this ticket at least three times.
  for(let hits=3;hits<=6;hits++){
   const insideParts=subsets(ticket,hits),outsideParts=subsets(outside,6-hits);
   for(const inside of insideParts)for(const outsidePart of outsideParts){
    let rank=0,a=0,b=0;
    for(let position=1;position<=6;position++){
     const value=b===outsidePart.length||(a<inside.length&&inside[a]<outsidePart[b])?inside[a++]:outsidePart[b++];
     rank+=choose[value-1][position];
    }
    if(maxima[rank]<hits)maxima[rank]=hits;
   }
  }
 }
 const histogram=Array(7).fill(0);for(const hits of maxima)histogram[hits]++;
 // Index0 combines all draws with fewer than three hits; indices1and2 unused.
 const counts=Object.fromEntries([3,4,5,6].map(k=>[k,histogram.slice(k).reduce((a,b)=>a+b,0)]));
 return {games:tickets.length,ticketsSha256:sha(JSON.stringify(tickets)),lessThanThree:histogram[0],maximumHitsAtLeastThreeHistogram:histogram.slice(3),counts};
}
const results=[];
for(let m=1;m<=20;m++){
 const entry=document.templates[m],result=verify(entry.tickets);
 for(const k of [3,4,5,6])assert.equal(result.counts[k],entry.stats['favorable'+k]);
 results.push(result);console.log(JSON.stringify({games:m,counts:result.counts}));
}
const output={referenceDate:'2026-10-18',passed:true,totalPossibleDraws:TOTAL,method:'For every ticket enumerate all six-number draws with3,4,5,6matches; map each draw to its combinatorial rank, retain maximum match count, then count thresholds. No production formula or research helper imported.',templatesSha256:sha(fs.readFileSync(templatePath)),verifierSha256:sha(fs.readFileSync(__filename)),results};
fs.writeFileSync(path.join(__dirname,'current-template-verification-20261018.json'),JSON.stringify(output,null,2)+'\n');
