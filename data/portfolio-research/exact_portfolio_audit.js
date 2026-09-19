'use strict';
// Independent verifier: enumerate every possible DRAW, rather than enumerate
// each ticket's winning neighborhoods and union them with combinadic bitsets.
const fs=require('fs');
const TOTAL=8145060;
function choose(n,k){let x=1;for(let i=1;i<=k;i++)x=x*(n-i+1)/i;return x;}
function popcount32(x){x=x-((x>>>1)&0x55555555);x=(x&0x33333333)+((x>>>2)&0x33333333);return (((x+(x>>>4))&0x0f0f0f0f)*0x01010101)>>>24;}
function validate(input){
  if(!Array.isArray(input)||input.length>60)throw Error('Expected up to60 tickets.');
  for(const t of input)if(!Array.isArray(t)||t.length!==6||new Set(t).size!==6||t.some(x=>!Number.isInteger(x)||x<1||x>45))throw Error('Each ticket must have six distinct numbers in1..45.');
  return [...new Map(input.map(t=>{const s=[...t].sort((a,b)=>a-b);return [s.join(','),s]})).values()];
}
function baseline(m,threshold){
  let favorable=0;for(let k=threshold;k<=6;k++)favorable+=choose(6,k)*choose(39,6-k);
  let logNoWin=0;for(let i=0;i<m;i++)logNoWin+=Math.log1p(-favorable/(TOTAL-i));
  return {oneTicketFavorable:favorable,randomDistinctProbability:-Math.expm1(logNoWin)};
}
function evaluatePortfolio(input){
  const tickets=validate(input),m=tickets.length;
  const masks=tickets.map(t=>{let lo=0,hi=0;for(const n of t)if(n<=32)lo|=1<<(n-1);else hi|=1<<(n-33);return [lo,hi]});
  const low=new Int32Array(45),high=new Int32Array(45);for(let n=0;n<45;n++)if(n<32)low[n]=1<<n;else high[n]=1<<(n-32);
  const histogram=Array(7).fill(0);
  for(let a=0;a<40;a++)for(let b=a+1;b<41;b++){
    const lab=low[a]|low[b],hab=high[a]|high[b];
    for(let c=b+1;c<42;c++){
      const labc=lab|low[c],habc=hab|high[c];
      for(let d=c+1;d<43;d++){
        const labcd=labc|low[d],habcd=habc|high[d];
        for(let e=d+1;e<44;e++){
          const labcde=labcd|low[e],habcde=habcd|high[e];
          for(let f=e+1;f<45;f++){
            const lo=labcde|low[f],hi=habcde|high[f];let best=0;
            for(let i=0;i<m;i++){
              const hits=popcount32(lo&masks[i][0])+popcount32(hi&masks[i][1]);
              if(hits>best){best=hits;if(best===6)break;}
            }
            histogram[best]++;
          }
        }
      }
    }
  }
  if(histogram.reduce((a,b)=>a+b,0)!==TOTAL)throw Error('Enumeration count incorrect');
  const thresholds={};
  for(const k of [3,4,5,6]){
    const favorable=histogram.slice(k).reduce((a,b)=>a+b,0),base=baseline(m,k);
    thresholds[k]={favorable,total:TOTAL,probability:favorable/TOTAL,...base,unionBound:Math.min(1,m*base.oneTicketFavorable/TOTAL)};
  }
  const appearances=Array(45).fill(0),pairOverlaps=Array(7).fill(0);
  for(const t of tickets)for(const n of t)appearances[n-1]++;
  for(let i=0;i<m;i++)for(let j=i+1;j<m;j++)pairOverlaps[tickets[i].filter(n=>tickets[j].includes(n)).length]++;
  return {tickets,uniqueGames:m,inputGames:input.length,totalDraws:TOTAL,maxHitsHistogram:histogram,thresholds,
    uniqueNumbers:appearances.filter(x=>x>0).length,numberAppearances:appearances,pairOverlapHistogram:pairOverlaps};
}
function affineTemplates(m){const tickets=[];for(let slope=0;tickets.length<m&&slope<7;slope++)for(let intercept=0;tickets.length<m&&intercept<7;intercept++)tickets.push(Array.from({length:6},(_,x)=>x*7+(slope*x+intercept)%7+1));return tickets;}
module.exports={TOTAL,choose,popcount32,baseline,evaluatePortfolio,affineTemplates};
if(require.main===module){
  const [inputPath,outputPath]=process.argv.slice(2);
  const input=inputPath?JSON.parse(fs.readFileSync(inputPath,'utf8').replace(/^\uFEFF/,'')):{tickets:affineTemplates(8)};
  const started=Date.now();
  const results=Array.isArray(input)&&Array.isArray(input[0])?evaluatePortfolio(input):input.templates?Object.fromEntries(Object.entries(input.templates).map(([id,t])=>[id,evaluatePortfolio(t)])):evaluatePortfolio(input.tickets);
  const output={method:'Independent exhaustive enumeration of all8145060 main-number draws; bonus excluded.',elapsedSeconds:(Date.now()-started)/1000,results};
  if(outputPath)fs.writeFileSync(outputPath,JSON.stringify(output,null,2));
  else console.log(JSON.stringify(output,null,2));
}
