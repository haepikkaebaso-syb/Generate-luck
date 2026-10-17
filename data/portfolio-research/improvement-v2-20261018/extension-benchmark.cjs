'use strict';
// Reproduce: node data/portfolio-research/improvement-v2-20261018/extension-benchmark.cjs
// Writes this folder's extension-benchmark.json only. No production data changes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const C=require(path.join(root,'dist/core.js')),P=require(path.join(root,'dist/portfolio.js'));
const E=require(path.join(root,'dist/extension.js')),R=require(path.join(root,'dist/research.js'));
const templateFile='data/portfolio-research/improvement-v2-20261018/baseline-templates.json';
const templates=require(path.join(root,templateFile));
const rng=seed=>{const random=R.seededRandom(seed);return n=>Math.floor(random()*n);};
const disjoint=n=>Array.from({length:n},(_,i)=>Array.from({length:6},(_,j)=>i*6+j+1));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
function run(saved,amount,random,options){
  const snapshot=JSON.stringify(saved),start=performance.now(),result=E.extend(templates,saved,amount,random,options);
  const elapsedMs=performance.now()-start;
  assert.equal(JSON.stringify(saved),snapshot);
  assert.deepEqual(result.profile,P.analyze(result.numbers));
  return {result,elapsedMs};
}
function summarize(run){
  return {numbers:run.result.numbers,status:run.result.extension.status,
    favorable:run.result.extension.exactRoundFavorable,elapsedMs:run.elapsedMs,
    exactEvaluationCalls:run.result.extension.exactEvaluationCalls,search:run.result.extension.search};
}
const saved=disjoint(7),linear=[];
for(const seed of [1,4,5,6,8,19,45]){
  const before=run(saved,1,rng(seed),{refinementBudget:0});
  const after=run(saved,1,rng(seed),{});
  if(before.result.extension.exactRoundFavorable!==null)assert(after.result.extension.exactRoundFavorable>=before.result.extension.exactRoundFavorable);
  linear.push({seed,saved,amount:1,baseline:summarize(before),refined:summarize(after)});
}
const fixture=linear[0];
const beforeIndependent=R.coverageExact([...saved,...fixture.baseline.numbers]).favorable;
const afterIndependent=R.coverageExact([...saved,...fixture.refined.numbers]).favorable;
assert.equal(beforeIndependent,1525340);assert.equal(afterIndependent,1531940);
assert.equal(fixture.refined.search.acceptedImprovements,2);
const nonlinearSaved=[[1,2,3,4,5,6],[1,2,7,8,9,10]];
const evaluator=rows=>R.coverageExact(rows).favorable;
const nonlinearBefore=run(nonlinearSaved,6,()=>0,{evaluateRound:evaluator,maxExactEvaluations:24,refinementBudget:0});
const nonlinearAfter=run(nonlinearSaved,6,()=>0,{evaluateRound:evaluator,maxExactEvaluations:24});
assert(nonlinearAfter.result.extension.exactRoundFavorable>=nonlinearBefore.result.extension.exactRoundFavorable);
assert(nonlinearAfter.result.extension.exactEvaluationCalls<=24);
assert.equal(nonlinearAfter.result.roundProfile,null);
const nonlinearIndependent=R.coverageExact([...nonlinearSaved,...nonlinearAfter.result.numbers]).favorable;
assert.equal(nonlinearIndependent,nonlinearAfter.result.extension.exactRoundFavorable);
const fastRandom=rng(66),fastSaved=P.generate(templates,5,fastRandom).numbers;
const fast=run(fastSaved,5,fastRandom,{evaluateRound:()=>{throw new Error('Fast path called general evaluator');}});
assert.equal(fast.result.extension.status,'template-extension');assert.equal(fast.result.extension.search,null);
assert.equal(fast.result.extension.exactRoundFavorable,1875065);
const output={schemaVersion:1,createdAtUtc:new Date().toISOString(),inputTemplates:templateFile,baseline:'The same twelve generated candidates and original exact-linear/overlap ranking, with refinementBudget=0. Both paths receive the same frozen baseline templates and identical seeded RNG state, isolating the refinement change from later template improvements.',
  algorithm:'Keep the baseline winner; propose at most240 global label transpositions of the new batch across at most4 accepted moves. New-batch incidence is preserved, saved rows are never relabelled, and only strictly larger exact favorable counts are accepted.',
  exactEvaluatorContract:{input:'saved unique rows plus proposed new rows',output:'integer favorable winning-main-number combinations in0..8145060',defaultMaximumCalls:24,allowedMaximumCalls:[12,32],generalScoresStoredSeparatelyFromLinearProfile:true},
  sourceHashes:Object.fromEntries(['dist/extension.js','dist/portfolio.js','dist/research.js',templateFile,'data/portfolio-research/improvement-v2-20261018/extension-benchmark.cjs'].map(file=>[file,sha(file)])),
  linearCases:linear,
  independentlyEnumeratedFixture:{seed:1,saved,amount:1,baselineFavorable:beforeIndependent,refinedFavorable:afterIndependent,
    favorableIncrease:afterIndependent-beforeIndependent,percentagePointIncrease:100*(afterIndependent-beforeIndependent)/C.TOTAL,
    enumerator:'R.coverageExact enumerates each ticket\'s >=3-hit winning draws into a bitset, independently of the linear inclusion-exclusion score.',
    fixedSavedUpperBound:1531940,upperBoundReason:'Seven saved rows use42 distinct labels. A new row must overlap at least3 saved rows because only3 labels are unused. For a linear extension there are no distinct-intersection triangles: saved rows are pairwise disjoint. Favorable=8*194130-400*C(8,2)-3300*3=1531940. This is the optimum within linear extensions of this fixed saved set, not the unconditional8-game maximum.'},
  nonlinearCallbackCase:{saved:nonlinearSaved,amount:6,rng:'constant0',baseline:summarize(nonlinearBefore),refined:summarize(nonlinearAfter),independentFinalFavorable:nonlinearIndependent},
  preservedFastPath:{saved:fastSaved,amount:5,...summarize(fast)},
  timingNotes:'Wall-clock timings from the current local Node process; warmup and CPU vary. General callback timings here use the older independent bitset enumerator rather than the new production evaluator.',
  limits:['Both paths use the frozen baseline-templates.json, so this benchmark excludes later production template improvements.','Search is bounded and does not guarantee a global optimum.','Without a supplied exact evaluator, nonlinear combined portfolios retain the original overlap fallback without claiming an exact improvement.','The standalone, disjoint, and successful template embedding paths retain their existing behavior.']};
fs.writeFileSync(path.join(__dirname,'extension-benchmark.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({linearFixture:output.independentlyEnumeratedFixture,nonlinear:{baseline:nonlinearBefore.result.extension.exactRoundFavorable,refined:nonlinearAfter.result.extension.exactRoundFavorable,exactCalls:nonlinearAfter.result.extension.exactEvaluationCalls,elapsedMs:nonlinearAfter.elapsedMs},fastPathMs:fast.elapsedMs}));
