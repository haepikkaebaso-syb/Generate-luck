'use strict';
const assert=require('node:assert/strict'),T=require('./type-partitions.cjs'),M=require('./type-models.cjs'),E=require('./exact-type-cardinalities.json');
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name);}function close(a,b){assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);}
check('every exact partition sums to8,145,060',()=>{for(const p of E.partitions)assert.equal(p.categories.reduce((s,c)=>s+c.cardinality,0),T.TOTAL);});
check('smallest-largest and adjacency definitions',()=>{
 const a=T.classify([6,2,4,1,3,5]);assert.equal(a.sum,21);assert.equal(a.span,5);assert.equal(a.byPartition.odd_count.key,'3');assert.equal(a.byPartition.adjacent_pairs.key,'5');assert.equal(a.byPartition.prime_count.key,'3');assert.equal(a.byPartition.decade_occupancy.key,'6,0,0,0,0');
 const b=T.classify([40,41,42,43,44,45]);assert.equal(b.sum,255);assert.equal(b.byPartition.prime_count.key,'2');assert.equal(b.byPartition.decade_occupancy.key,'0,0,0,1,5');
});
check('impossible category and exact known sum cardinalities',()=>{
 assert.equal(E.partitions.find(p=>p.id==='last_digit_distinct').categories[0].cardinality,0);
 assert.deepEqual(E.partitions.find(p=>p.id==='sum_bin').categories.map(c=>c.cardinality),[434395,1789726,3037490,2190622,692827]);
});
check('empty-history prior is exactly uniform for all ticket models',()=>{const s=M.scoreTicket(M.fitTypeModels([]),[1,2,3,4,5,6]);for(const id of M.IDS)close(s[id].jointLogGain,0);});
check('156 repeated training rows yield fixed156prior half-and-half rates',()=>{
 const h=Array.from({length:156},(_,i)=>({round:i+1,numbers:[1,2,3,4,5,6],firstPrizeWinners:i*100})),f=M.fitTypeModels(h),features=T.classify(h[0].numbers);
 T.PARTITIONS.forEach((p,i)=>{const probabilities=f.byPartition[p.id].categoryProbabilities;close(probabilities.reduce((s,x)=>s+x,0),1);const j=features.indices[i],q=E.partitions[i].categories[j].theoreticalProbability;close(probabilities[j],(1+q)/2);});
 const modified=h.map(d=>({...d,firstPrizeWinners:999999999}));assert.deepEqual(M.fitTypeModels(modified),f);
});
check('trailing156 truncation and exact normalized11component mixture',()=>{
 const h=Array.from({length:200},(_,i)=>({round:i+1,numbers:i<44?[40,41,42,43,44,45]:[1,2,3,4,5,6]})),f=M.fitTypeModels(h);assert.equal(f.historyFirstRound,45);assert.equal(f.historyLastRound,200);assert.equal(f.trainingDrawCount,156);assert.deepEqual(f,M.fitTypeModels(h.slice(-156)));
 const s=M.scoreTicket(f,[1,2,3,4,5,6]);close(s.type_mixture.experimentalTicketProbability,M.IDS.slice(0,-1).reduce((v,id)=>v+s[id].experimentalTicketProbability,0)/11);
});
check('invalid duplicate range and sparse numbers rejected',()=>{for(const a of [[1,2,3,4,5,5],[1,2,3,4,5,46],[1,2,3,4,5,,],[1,2,3,4,5]])assert.throws(()=>T.classify(a));});
console.log(JSON.stringify({passed,failed:0}));
