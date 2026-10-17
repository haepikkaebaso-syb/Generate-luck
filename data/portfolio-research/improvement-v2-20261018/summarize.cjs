'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('../../../dist/portfolio.js'),R=require('../../../dist/research.js');
const one=require('./phase1-results.json'),two=require('./results.json'),baseline=require('./baseline-templates.json');
const bestCandidates=[];
for(let games=9;games<=20;games++){
 const options=[one.results.find(r=>r.games===games),two.results.find(r=>r.games===games)].filter(Boolean);
 options.sort((a,b)=>b.candidateFavorable-a.candidateFavorable);
 const chosen=options[0],analysis=P.analyze(chosen.tickets),exact=R.coverageExact(chosen.tickets);
 const old=P.analyze(baseline.templates[games].tickets).probabilities[3].favorable;
 if(exact.favorable!==analysis.probabilities[3].favorable||exact.favorable!==chosen.candidateFavorable||exact.favorable<old)throw new Error('Coverage verification failed');
 if(analysis.distinctNumbers!==45||analysis.maximumUsage-analysis.minimumUsage>1||analysis.maxOverlap>1)throw new Error('Structural invariant failed');
 bestCandidates.push({games,baselineFavorable:old,candidateFavorable:exact.favorable,gain:exact.favorable-old,
  baselineProbability:old/exact.total,candidateProbability:exact.probability,gainPercentagePoints:100*(exact.favorable-old)/exact.total,
  phase:two.results.includes(chosen)?2:1,discovery:chosen.discovery||null,tickets:chosen.tickets,analysis,independentExact:exact});
}
const sourceFiles=['baseline-templates.json','phase1.cjs','phase1-results.json','search.cjs','results.json','summarize.cjs'];
const output={method:'Two bounded fixed-seed/fixed-attempt research passes; number-use degrees and linearity preserved; all12final candidates independently enumerated by winning-domain bitset. No historical draw data used.',
 globalOptimalityClaim:false,countsSearched:[9,10,11,12,13,14,15,16,17,18,19,20],untouchedCounts:[1,2,3,4,5,6,7,8],
 phase1AttemptBudget:one.results.reduce((n,r)=>n+r.runs.reduce((s,x)=>s+x.budget,0),0),
 phase2CompletedAttemptBudget:two.results.reduce((n,r)=>n+r.runs.reduce((s,x)=>s+x.budget,0),0),
 phase1DurationSeconds:one.durationSeconds,phase2DurationSeconds:two.durationSeconds,
 phase2Complete:two.results.length===12&&two.results.every(r=>r.independentExact&&r.runs.length===(r.games<=15?4:r.games===16?6:20)),
 improvedCounts:bestCandidates.filter(r=>r.gain>0).map(r=>r.games),bestCandidates,
 sourceSha256:Object.fromEntries(sourceFiles.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex')]))};
fs.writeFileSync(path.join(__dirname,'best-candidates.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({phase2Complete:output.phase2Complete,improved:bestCandidates.filter(r=>r.gain).map(r=>({games:r.games,gain:r.gain,gainPercentagePoints:r.gainPercentagePoints,before:r.baselineProbability,after:r.candidateProbability})),attempts:output.phase1AttemptBudget+output.phase2CompletedAttemptBudget},null,2));
