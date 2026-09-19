'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const L=require('./lag-models.cjs'),R=require('./run-lag-experiment.cjs');
const reference=require(String.raw`D:\로또 당첨번호 발생기\dist\research.js`);
const p0=6/45,A=[1,2,3,4,5,6],B=[7,8,9,10,11,12];
let tests=0;
function check(name,fn){fn();tests++;console.log('PASS '+name);}
function close(a,b,tol=1e-11){assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);}
function history(arrays){return arrays.map((numbers,i)=>({round:i+1,numbers:numbers.slice()}));}
check('single exact antecedent count and excludes unknown future target',()=>{
 const h=history([A,B,A]),out=L.fitLagWeights(h,'lag_single1');
 for(let n=1;n<=45;n++)close(out.weights[n-1],B.includes(n)?(1+80*p0)/(81*p0):80/81);
 assert.equal(out.diagnostics.lags[0].trainingPairCount,2);assert.equal(out.diagnostics.lags[0].trainingMaxTargetIndex,2);
});
check('pair condition minimum support boundary 7 versus 8',()=>{
 assert.deepEqual(L.fitLagWeights(history(Array(8).fill(A)),'lag_pair123').weights,Array(45).fill(1));
 const out=L.fitLagWeights(history(Array(9).fill(A)),'lag_pair123');
 assert.equal(out.diagnostics.activeConditionCount,15);
 for(let n=1;n<=45;n++)close(out.weights[n-1],A.includes(n)?(8+80*p0)/(88*p0):80/88);
});
check('similarity weighted support and equal three-lag aggregation',()=>{
 const out=L.fitLagWeights(history([A,B,A]),'lag_similarity123');
 close(out.diagnostics.lags[0].effectiveWeightedSupport,1);close(out.diagnostics.lags[1].effectiveWeightedSupport,0);close(out.diagnostics.lags[2].effectiveWeightedSupport,0);
 for(let n=1;n<=45;n++)close(out.weights[n-1],((B.includes(n)?(1+80*p0)/(81*p0):80/81)+2)/3);
});
check('uniform and empty-history fallbacks',()=>{
 for(const m of L.MODELS)assert.deepEqual(L.fitLagWeights([],m.id).weights,Array(45).fill(1));
 const d=R.exactDistribution(Array(45).fill(1));assert.equal(d.z,8145060);d.marginals.forEach(p=>close(p,p0));
 const s=R.scoreForecast({...d,weights:Array(45).fill(1)},A);close(s.jointLogGain,0);close(s.brier,p0*(1-p0));assert.deepEqual(s.top6,A);
});
check('exact marginals agree with independent existing weightedSpace',()=>{
 const w=Array.from({length:45},(_,i)=>.4+(i%9)/10),d=R.exactDistribution(w),expected=reference.weightedSpace(w).marginals();
 d.marginals.forEach((p,i)=>close(p,expected[i]));close(d.marginals.reduce((a,b)=>a+b,0),6);
 const scaled=R.exactDistribution(w.map(x=>x*3));scaled.marginals.forEach((p,i)=>close(p,d.marginals[i]));
 close(R.scoreForecast({...d,weights:w},A).jointLogGain,R.scoreForecast({...scaled,weights:w.map(x=>x*3)},A).jointLogGain);
});
check('all lag models are positive, preserve history, and expose past-only training',()=>{
 const h=history(Array.from({length:30},(_,i)=>Array.from({length:6},(_,j)=>(i*7+j*3)%45+1))),before=JSON.stringify(h);
 for(const m of L.MODELS){const f=L.fitLagWeights(h,m.id);assert.ok(f.weights.every(x=>x>0&&Number.isFinite(x)));close(f.weights.reduce((a,b)=>a+b,0),45);for(const lag of f.diagnostics.lags){if(lag.trainingPairCount){assert.equal(lag.sourceIndex,h.length-lag.lag);assert.ok(lag.trainingMaxTargetIndex<h.length);assert.equal(lag.trainingMaxSourceIndex+lag.lag,lag.trainingMaxTargetIndex);}}}
 assert.equal(JSON.stringify(h),before);
});
check('mixture exact normalized probabilities and marginals',()=>{
 const h=history([A,B,A,B,A,B,A,B,A,B,A]),forecasts=R.forecastAll(h),scores=R.evaluate(h,A),mix=forecasts.lag_mixture;
 const probabilities=L.MODELS.map(m=>{const f=forecasts[m.id];return A.reduce((s,n)=>s*f.weights[n-1],1)/f.z;});
 close(Math.exp(scores.lag_mixture.jointLogGain)/8145060,probabilities.reduce((a,b)=>a+b,0)/6,1e-15);
 close(mix.marginals.reduce((a,b)=>a+b,0),6);
 assert.ok(scores.lag_mixture.jointLogGain+1e-12>=L.MODELS.reduce((s,m)=>s+scores[m.id].jointLogGain,0)/6);
 assert.ok(scores.lag_mixture.brier<=L.MODELS.reduce((s,m)=>s+scores[m.id].brier,0)/6+1e-12);
 assert.equal(mix.weights,undefined);
});
check('UMD browser export without CommonJS dependency',()=>{
 const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('./lag-models.cjs'),'utf8'),context);
 assert.equal(typeof context.LottoLag.fitLagWeights,'function');assert.equal(context.LottoLag.fitLagWeights([],'uniform').weights.length,45);
});
console.log(JSON.stringify({passed:tests,failed:0}));
