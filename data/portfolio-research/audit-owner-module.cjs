'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const OUT=String.raw`C:\Users\Public\Documents\ESTsoft\CreatorTemp\lotto-linear-portfolios-20260913`;
const ROOT=String.raw`D:\로또 당첨번호 발생기`;
const P=require(path.join(ROOT,'dist','portfolio.js')),C=require(path.join(ROOT,'dist','core.js'));
const templates=JSON.parse(fs.readFileSync(path.join(OUT,'portfolio-templates.json'),'utf8'));
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function rng(seed){let a=seed>>>0;return n=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return Math.floor(((t^(t>>>14))>>>0)/4294967296*n);};}
const results=[],defects=[];
function check(name,fn){try{fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});defects.push({name,error:e.message});}}
function sameStats(profile,reference){
 assert.deepEqual(profile.usage,reference.usage);assert.equal(profile.games,reference.m);assert.equal(profile.total,8145060);assert.equal(profile.maxOverlap,reference.maxPairOverlap);assert.equal(profile.overlappingPairs,reference.overlappingTicketPairs);assert.equal(profile.triangles,reference.bergeTriangles);assert.equal(profile.quadruples,reference.bergeK4);
 for(const k of [3,4,5,6]){assert.equal(profile.probabilities[k].favorable,reference['favorable'+k]);assert.equal(profile.probabilities[k].probability,reference['favorable'+k]/8145060);}
}
check('all20 final templates agree with independent statistics',()=>{for(let m=1;m<=20;m++)sameStats(P.analyze(templates.templates[m].tickets),templates.templates[m].stats);});
check('100 deterministic relabelings preserve every probability and balanced usage',()=>{
 for(let m=1;m<=20;m++)for(let k=0;k<5;k++){
  const before=JSON.stringify(templates),out=P.generate(templates,m,rng(490001+100*m+k)),a=out.profile,e=templates.templates[m].stats;
  assert.equal(out.numbers.length,m);assert.equal(a.games,m);assert.equal(a.maxOverlap,e.maxPairOverlap);assert.equal(a.distinctNumbers,e.distinctNumbers);assert.equal(a.minimumUsage,e.minimumUsage);assert.equal(a.maximumUsage,e.maximumUsage);
  for(const threshold of [3,4,5,6])assert.equal(a.probabilities[threshold].favorable,e['favorable'+threshold]);
  assert.ok(out.numbers.every(t=>t.every((n,i)=>!i||n>t[i-1])));assert.equal(JSON.stringify(templates),before);
  sameStats(P.analyze(out.numbers),{...e,usage:a.usage});
 }
});
const valid=[1,2,3,4,5,6];
const invalid=[
 ['null',null],['object',{}],['empty',[]],['21tickets',[...templates.templates[20].tickets,valid]],['duplicate ticket',[valid,valid.slice().reverse()]],['overlap2',[valid,[1,2,7,8,9,10]]],['overlap5',[valid,[1,2,3,4,5,7]]],['length5',[[1,2,3,4,5]]],['length7',[[1,2,3,4,5,6,7]]],['duplicate number',[[1,2,3,4,5,5]]],['zero',[[0,2,3,4,5,6]]],['46',[[1,2,3,4,5,46]]],['decimal',[[1,2,3,4,5,6.1]]],['string',[['1',2,3,4,5,6]]],['null number',[[null,2,3,4,5,6]]],['NaN',[[NaN,2,3,4,5,6]]],['Infinity',[[Infinity,2,3,4,5,6]]],['sparse inner',[[1,2,3,4,5,,]]],['sparse outer',Array(1)],['null row',[null]],['undefined row',[undefined]]
];
for(const [name,input] of invalid)check('reject invalid analyze '+name,()=>assert.throws(()=>P.analyze(input)));
for(const amount of [-1,0,21,1.5,'5',NaN,null,Infinity])check('reject invalid generation amount '+String(amount),()=>assert.throws(()=>P.generate(templates,amount,rng(1))));
check('reject missing wrong-size and malformed template',()=>{assert.throws(()=>P.generate({},5));assert.throws(()=>P.generate({templates:{5:{tickets:[valid]}}},5));assert.throws(()=>P.generate({templates:{1:{tickets:[[1,2,3,4,5,,]]}}},1));});
for(const [label,random] of [['negative',()=>-1],['upper-bound',n=>n],['fraction',()=>.5],['NaN',()=>NaN],['string',()=> '0']])check('reject invalid RNG '+label,()=>assert.throws(()=>P.generate(templates,5,random)));
check('shuffle consumes44label swaps and amount-1ticket swaps',()=>{let calls=0;P.generate(templates,20,n=>{calls++;return n-1;});assert.equal(calls,63);});
check('nonlinear input is rejected without mutating it',()=>{const x=[valid,[1,2,7,8,9,10]],before=JSON.stringify(x);assert.throws(()=>P.analyze(x));assert.equal(JSON.stringify(x),before);});
check('random baseline matches exact without-replacement product at all sizes and thresholds',()=>{
 for(let m=0;m<=20;m++)for(const k of [3,4,5,6]){
  let numerator=1n,denominator=1n;for(let i=0;i<m;i++){numerator*=BigInt(C.TOTAL-P.ONE[k]-i);denominator*=BigInt(C.TOTAL-i);}
  const exact=Number(denominator-numerator)/Number(denominator),got=P.randomBaseline(m,k);assert.ok(Math.abs(exact-got)<2e-15);if(k===6)assert.ok(Math.abs(got-m/C.TOTAL)<1e-20);
 }
});
check('invalid baseline arguments are rejected',()=>{for(const args of [[-1,3],[21,3],[1.5,3],[5,2],[5,7],[null,3]])assert.throws(()=>P.randomBaseline(...args));});
check('browser IIFE exposes complete API without CommonJS',()=>{const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'dist','core.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'dist','portfolio.js'),'utf8'),ctx);assert.equal(typeof ctx.LottoPortfolio.generate,'function');assert.equal(ctx.LottoPortfolio.analyze([[1,2,3,4,5,6]]).probabilities[3].favorable,194130);});
const search=JSON.parse(fs.readFileSync(path.join(OUT,'portfolio-analysis.json'),'utf8'));
const budget={sizesSearched:13,randomizedStartingDesignsPerSize:20,totalRandomizedStartingDesigns:260,adaptiveRestartsAfterFailedDesign:0,maximumConflictRepairAttemptsPerStartingDesign:80000,totalConflictRepairAttemptsActuallyUsed:search.analysis.reduce((sum,a)=>sum+a.candidates.reduce((s,c)=>s+c.steps,0),0),maximumConflictRepairAttemptsActuallyUsed:Math.max(...search.analysis.flatMap(a=>a.candidates.map(c=>c.steps))),initialDegreePreservingRandomizationAttemptsPerCandidate:'m*200',totalInitialRandomizationAttempts:728000,topCandidatesLocallyImprovedPerSize:3,localSwapAttemptsPerCandidate:3000,totalLocalSwapAttempts:117000,optimizedCandidatesExactChecked:39,additionalDeterministicReviewCandidates:2,additionalDeterministicReviewCounts:[10,15],finalBoundedPassFrozen:true,baselineCountsWithFiveSeeds:[8,10,15,20],otherBaselineCountsWithOneSeed:[9,11,12,13,14,16,17,18,19],totalBaselineSeeds:29,candidateSeedFormula:'20260913+10000*m+c, c=0..19',localSeedFormula:'30300000+1000*m+i, i=0..2',baselineSeedFormula:'20260913+101*m+b, b=0..4 for8/10/15/20, otherwise b=0'};
const report={createdAtUtc:new Date().toISOString(),passed:defects.length===0,checksPassed:results.filter(r=>r.passed).length,checksFailed:defects.length,permutationChecks:100,results,defects,previousDefect:{name:'Sparse outer and inner arrays skipped by Array.some/every',status:'Fixed by owner; regression cases now checked'},claimsReview:{linearExactFormula:'Correct on all tested paths. analyze rejects non-linear inputs.',atLeast4UpperBound:'Valid: any two >=4 events would require at least7 distinct winning numbers; all per-ticket events disjoint.',jackpotProbability:'m/8145060, same for every portfolio of m distinct tickets.',randomBaseline:'Exact average over uniformly selected distinct tickets; not independent with-replacement approximation.',atLeast3GlobalOptimum:'Not claimed; bounded search plus two deterministic review improvements.',templateRelabeling:'Uniform full45label Fisher-Yates preserves structure and makes every individual ticket marginally uniform when supplied bounded RNG is unbiased.',uiSnapshot:'dist/index.html described unconstrained full45 generation, removed fixed/excluded controls, separated >=3 fromprofit and retained global-optimum limitation; app wiring remains owner work in progress at audit start.'},searchBudget:budget,hashes:{ownerPortfolio:sha(path.join(ROOT,'dist','portfolio.js')),ownerCore:sha(path.join(ROOT,'dist','core.js')),finalTemplates:sha(path.join(OUT,'portfolio-templates.json')),buildCode:sha(path.join(OUT,'build-portfolios.cjs')),runtime:sha(path.join(OUT,'portfolio-runtime.cjs'))}};
fs.writeFileSync(path.join(OUT,'owner-module-audit.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(OUT,'verification-summary.json'),JSON.stringify({all20TemplatesValid:report.passed,ownerModuleChecksPassed:report.checksPassed,ownerModuleChecksFailed:report.checksFailed,relabelingInvarianceChecks:100,finalTemplatesHash:report.hashes.finalTemplates,independentExhaustiveAudit:'C:/Users/Public/Documents/ESTsoft/CreatorTemp/lotto-portfolio-audit-20260913/proposed-template-verification.json',hashes:report.hashes},null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checksPassed:report.checksPassed,checksFailed:report.checksFailed,defects,hashes:report.hashes,searchBudget:budget},null,2));
