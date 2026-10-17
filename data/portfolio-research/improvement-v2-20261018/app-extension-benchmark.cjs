'use strict';
// Reproduce from the repository root:
// node data/portfolio-research/improvement-v2-20261018/app-extension-benchmark.cjs
// Only app-extension-benchmark.json in this folder is written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const vm=require('node:vm'),{execFileSync}=require('node:child_process');
const {createRequire}=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
// Pin the former HEAD so this benchmark remains reproducible after deployment.
const BASELINE_REF='0d361dc1dba8bf37a372958b0d23388aa3b54f6d';
const historical=file=>execFileSync('git',['show',BASELINE_REF+':'+file],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const TEMPLATE_FILE='data/portfolio-research/improvement-v2-20261018/baseline-templates.json';
const sources=['dist/core.js','dist/portfolio.js','dist/extension.js','dist/coverage.js','dist/generation.js','dist/research.js',TEMPLATE_FILE,'data/portfolio-research/improvement-v2-20261018/app-extension-benchmark.cjs'];
const sourceHashes=Object.fromEntries(sources.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const oldSource=historical('dist/extension.js'),oldAppSource=historical('dist/app.js');
// The old app ran all eight calls, retained the first result on equal scores,
// and assigned null roundProfile the score -1. There was no early fast-path exit.
assert(oldAppSource.includes('for(let attempt=0;attempt<8;attempt++)'));
assert(oldAppSource.includes('if(!result||value>previous)result=candidate;'));
const oldModule={exports:{}},sandbox={module:oldModule,exports:oldModule.exports,require:createRequire(path.join(root,'dist/extension.js'))};
vm.runInNewContext(oldSource,sandbox,{filename:BASELINE_REF+':dist/extension.js'});
const oldExtension=oldModule.exports;
const C=require(path.join(root,'dist/core.js')),P=require(path.join(root,'dist/portfolio.js'));
const X=require(path.join(root,'dist/coverage.js')),G=require(path.join(root,'dist/generation.js'));
const R=require(path.join(root,'dist/research.js')),templates=require(path.join(root,TEMPLATE_FILE));
function rng(seed){
  const random=R.seededRandom(seed);let calls=0;
  const next=n=>{calls++;return Math.floor(random()*n);};
  next.calls=()=>calls;return next;
}
function oldApp(saved,amount,random){
  let result=null,chosenAttempt=0;const attempts=[];
  for(let attempt=0;attempt<8;attempt++){
    const candidate=oldExtension.extend(templates,saved,amount,random);
    const value=candidate.roundProfile?.probabilities[3].favorable??-1;
    const previous=result?.roundProfile?.probabilities[3].favorable??-1;
    if(!result||value>previous){result=candidate;chosenAttempt=attempt+1;}
    attempts.push({attempt:attempt+1,status:candidate.extension.status,selectionScore:value});
  }
  return {result,attempts,chosenAttempt};
}
function measure(kind,saved,amount,seed){
  const snapshot=JSON.stringify(saved),random=rng(seed),start=performance.now();
  const run=kind==='old'?oldApp(saved,amount,random):{result:G.generate(templates,saved,amount,random)};
  const generationMs=performance.now()-start,result=run.result;
  assert.equal(JSON.stringify(saved),snapshot,'Stored rows must remain unchanged');
  assert.equal(result.numbers.length,amount);
  const keys=result.numbers.map(C.key),savedKeys=new Set(saved.map(C.key));
  assert.equal(new Set(keys).size,amount);
  assert(keys.every(key=>!savedKeys.has(key)),'The new batch must exclude saved tickets');
  P.analyze(result.numbers); // New batch must remain a valid supported linear portfolio.
  const exactStart=performance.now(),exact=X.coverageExact([...saved,...result.numbers]);
  const validationMs=performance.now()-exactStart;
  if(result.roundProfile)assert.equal(result.roundProfile.probabilities[3].favorable,exact.favorable);
  return {numbers:result.numbers,status:result.extension.status,
    favorable:exact.favorable,probability:exact.probability,
    reportedRoundFavorable:result.roundProfile?.probabilities[3].favorable??null,
    generationMs,independentFinalValidationMs:validationMs,rngCalls:random.calls(),
    chosenAttempt:run.chosenAttempt??null,oldSelectionAttempts:run.attempts??null,extension:result.extension};
}
const disjoint=n=>Array.from({length:n},(_,i)=>Array.from({length:6},(_,j)=>i*6+j+1));
const nonlinear=[[1,2,3,4,5,6],[1,2,7,8,9,10]];
const fixtures=[
  {id:'disjoint-saved-7-add-1',saved:disjoint(7),amount:1},
  {id:'nonlinear-saved-2-add-6',saved:nonlinear,amount:6},
  {id:'nonlinear-saved-2-add-8',saved:nonlinear,amount:8},
  {id:'template-saved-20-add-5',saved:templates.templates[20].tickets.map(row=>row.slice()),amount:5}
];
const comparisons=[];
for(const fixture of fixtures){
  for(let seed=1;seed<=5;seed++){
    const old=measure('old',fixture.saved,fixture.amount,seed);
    const current=measure('current',fixture.saved,fixture.amount,seed);
    const change=current.favorable-old.favorable;
    comparisons.push({fixture:fixture.id,seed,old,current,change,
      percentagePointChange:100*change/C.TOTAL,outcome:change>0?'improved':change<0?'worse':'tied'});
  }
  const rows=comparisons.filter(row=>row.fixture===fixture.id);
  console.log(JSON.stringify({fixture:fixture.id,results:rows.map(row=>({seed:row.seed,old:row.old.favorable,current:row.current.favorable,change:row.change,oldMs:row.old.generationMs,currentMs:row.current.generationMs}))}));
}
const describe=values=>({min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length});
function summarize(rows){
  return {cases:rows.length,improved:rows.filter(row=>row.change>0).length,tied:rows.filter(row=>row.change===0).length,worse:rows.filter(row=>row.change<0).length,
    favorableChange:describe(rows.map(row=>row.change)),percentagePointChange:describe(rows.map(row=>row.percentagePointChange)),
    oldGenerationMs:describe(rows.map(row=>row.old.generationMs)),currentGenerationMs:describe(rows.map(row=>row.current.generationMs))};
}
const output={schemaVersion:1,createdAtUtc:new Date().toISOString(),nodeVersion:process.version,platform:process.platform,architecture:process.arch,
  baseline:{gitCommit:BASELINE_REF,extensionSha256:hash(oldSource),appSha256:hash(oldAppSource),
    policy:'The original app calls the original E.extend exactly eight times with one continuous seeded RNG. It chooses the greatest linear roundProfile favorable count, treating a null profile as -1, retaining the first candidate on ties.',
    sharedCurrentDependencies:['dist/core.js','dist/portfolio.js'],
    sharedDependenciesMatchHistoricalSource:Object.fromEntries(['dist/core.js','dist/portfolio.js'].map(file=>[file,historical(file).replace(/\r\n/g,'\n')===fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')])),
    sharedFrozenTemplates:{file:TEMPLATE_FILE,sha256:sourceHashes[TEMPLATE_FILE],historicalFile:'data/portfolio-templates.json',
      matchesHistoricalSource:historical('data/portfolio-templates.json').replace(/\r\n/g,'\n')===fs.readFileSync(path.join(root,TEMPLATE_FILE),'utf8').replace(/\r\n/g,'\n')}},
  current:{entryPoint:'G.generate in dist/generation.js',inputTemplates:TEMPLATE_FILE,sourceHashes},
  method:{seeds:[1,2,3,4,5],rng:'R.seededRandom with integer output floor(random*n)',sameInitialRngState:true,
    exactFinalScoring:'X.coverageExact on saved rows plus final new batch, including nonlinear totals and all 25 tickets.',
    storageAndBatchChecks:'Both paths must leave saved rows unchanged, return no saved duplicates, and produce a linear new batch accepted by P.analyze.',
    timing:'One old run then one current run per seed; generation time excludes the separate final validation. These local single-run timings include uneven JIT warmup and do not predict browser device latency.'},
  fixtures,comparisons,summary:summarize(comparisons),summaryByFixture:Object.fromEntries(fixtures.map(fixture=>[fixture.id,summarize(comparisons.filter(row=>row.fixture===fixture.id))])),
  sourceChangedDuringRun:sources.filter(file=>sourceHashes[file]!==hash(fs.readFileSync(path.join(root,file)))),
  limitations:['Both generators receive the same frozen baseline-templates.json. This isolates the additional-generation engine change; it does not measure later production template improvements.','Twenty deterministic cases are a small regression benchmark, not proof of an average or universal gain.','Matching seeds only matches the initial RNG state. Refinement and early returns consume different random sequences, so candidate sets can differ and an individual current result can be worse than the old app result.','The extension search accepts strict improvements over its own retained baseline. This does not by itself guarantee dominance over all eight candidates selected by the previous app.','This compares overlap coverage for the same number of purchased games; it makes no claim of predicting drawn numbers or increasing one ticket\'s jackpot probability.']};
fs.writeFileSync(path.join(__dirname,'app-extension-benchmark.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({summary:output.summary,sourceChangedDuringRun:output.sourceChangedDuringRun}));
