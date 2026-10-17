'use strict';
const fs=require('node:fs'),path=require('node:path');
const P=require('../../dist/portfolio.js'),R=require('../../dist/research.js'),D=require('./portfolio-templates-20260913.json');
const tickets=Array.from({length:16},()=>[]);let label=1;
const group=vertices=>{vertices.forEach(i=>tickets[i].push(label));label++;};
// Seven tickets share one distinct label per pair (the K7 component).
for(let i=0;i<7;i++)for(let j=i+1;j<7;j++)group([i,j]);
// Nine further tickets form a 3x3 grid. Each row and column shares one label.
for(let r=0;r<3;r++)group([7+r*3,8+r*3,9+r*3]);
for(let c=0;c<3;c++)group([7+c,10+c,13+c]);
// Every other pair of grid tickets shares its own distinct label.
for(let i=0;i<9;i++)for(let j=i+1;j<9;j++)if(Math.floor(i/3)!==Math.floor(j/3)&&i%3!==j%3)group([7+i,7+j]);
if(label!==46||tickets.some(row=>row.length!==6))throw new Error('Invalid construction');
const analysis=P.analyze(tickets),exact=R.coverageExact(tickets);
if(analysis.probabilities[3].favorable!==exact.favorable)throw new Error('Independent enumeration mismatch');
const baselineFavorable=D.templates[16].stats.favorable3;
const result={games:16,construction:'K7 and K9 with six triple labels from 3x3 grid rows and columns',tickets,analysis,exact,baselineFavorable,gain:exact.favorable-baselineFavorable};
fs.writeFileSync(path.join(__dirname,'structured16-20261018.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({games:16,gain:result.gain,before:baselineFavorable/exact.total,after:exact.probability,independentVerified:true}));
