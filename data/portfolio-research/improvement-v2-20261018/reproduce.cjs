'use strict';
// Re-run the three discovery seeds without running or writing the full search.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('../../../dist/portfolio.js'),R=require('../../../dist/research.js');
const source=fs.readFileSync(path.join(__dirname,'search.cjs'),'utf8');
const split=source.indexOf('const args=process.argv.slice(2)');
if(split<0)throw new Error('Cannot locate isolated search function boundary');
const isolated={exports:{}};
new Function('require','__dirname','module',source.slice(0,split)+'\nmodule.exports={search};')(require,__dirname,isolated);
const one=require('./phase1-results.json'),two=require('./results.json'),best=require('./best-candidates.json');
const canonical=rows=>rows.map(r=>r.slice().sort((a,b)=>a-b).join(',')).sort().join(';');
const verifications=[],started=Date.now();
for(const games of [18,19,20]){
 const expected=best.bestCandidates.find(r=>r.games===games),history=two.results.find(r=>r.games===games);
 const run=history.runs.find(r=>r.seed===expected.discovery.seed);
 const initial=one.results.find(r=>r.games===games).tickets;
 if(P.analyze(initial).probabilities[3].favorable!==run.startingFavorable)throw new Error('Wrong replay starting state');
 let lastDiscovery=null;
 const replay=isolated.exports.search(initial,run.seed,run.budget,run.shake,(_rows,_score,found)=>{lastDiscovery=found;},run.settings);
 const sameTickets=canonical(replay.tickets)===canonical(expected.tickets),exact=R.coverageExact(replay.tickets);
 const sameDiscovery=lastDiscovery.seed===expected.discovery.seed&&lastDiscovery.attempt===expected.discovery.attempt;
 if(!sameTickets||!sameDiscovery||exact.favorable!==expected.candidateFavorable)throw new Error('Seed replay mismatch');
 const record={games,seed:run.seed,budget:run.budget,shake:run.shake,settings:run.settings,discovery:lastDiscovery,sameTickets,sameDiscovery,independentExact:exact};
 verifications.push(record);console.log(JSON.stringify(record));
}
const sourceFiles=['reproduce.cjs','search.cjs','phase1-results.json','results.json','best-candidates.json'];
fs.writeFileSync(path.join(__dirname,'replay-verification.json'),JSON.stringify({allPassed:true,durationSeconds:(Date.now()-started)/1000,verifications,sourceSha256:Object.fromEntries(sourceFiles.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex')]))},null,2)+'\n');
