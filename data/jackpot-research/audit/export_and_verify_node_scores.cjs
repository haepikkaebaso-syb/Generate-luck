'use strict';
const fs=require('fs'),path=require('path');
const T=require('C:/Users/Public/Documents/ESTsoft/CreatorTemp/lotto-jackpot-types-20260913/type-partitions.cjs');
const M=require('C:/Users/Public/Documents/ESTsoft/CreatorTemp/lotto-jackpot-types-20260913/type-models.cjs');
const source=JSON.parse(fs.readFileSync('D:/로또 당첨번호 발생기/data/draws.json','utf8').replace(/^\uFEFF/,''));
const draws=source.draws,rows=[];let normalizationChecks=0,mixtureChecks=0;
function checkFit(fit){
  for(const part of Object.values(fit.byPartition)){
    if(Math.abs(part.categoryProbabilities.reduce((a,b)=>a+b,0)-1)>1e-12)throw Error('Not normalized');
    if(part.categoryProbabilities.some(p=>p<0||p>1||!Number.isFinite(p)))throw Error('Invalid category mass');
    normalizationChecks++;
  }
}
for(let index=156;index<draws.length;index++){
  const fit=M.fitTypeModels(draws.slice(0,index));
  if(fit.trainingDrawCount!==156||fit.historyLastRound!==draws[index].round-1)throw Error('Target included or wrong window');
  checkFit(fit);
  const scores=M.scoreTicket(fit,draws[index].numbers),arithmetic=M.IDS.slice(0,-1).reduce((sum,id)=>sum+scores[id].experimentalTicketProbability,0)/11;
  if(Math.abs(arithmetic-scores.type_mixture.experimentalTicketProbability)>1e-20)throw Error('Mixture not probability mean');
  mixtureChecks++;
  rows.push({round:draws[index].round,historyFirstRound:fit.historyFirstRound,historyLastRound:fit.historyLastRound,scores});
}
let futurePerturbationChecks=0,oldHistoryExclusionChecks=0;
for(const index of [156,157,311,417,418,521]){
  const original=M.fitTypeModels(draws.slice(0,index));
  const corrupted=draws.map((d,i)=>i>=index?{...d,numbers:[1,2,3,4,5,6]}:d);
  if(JSON.stringify(original)!==JSON.stringify(M.fitTypeModels(corrupted.slice(0,index))))throw Error('Future affects fitted distribution');
  futurePerturbationChecks++;
  const oldChanged=draws.slice(0,index).map((d,i)=>i<index-156?{...d,numbers:[1,2,3,4,5,6]}:d);
  if(JSON.stringify(original)!==JSON.stringify(M.fitTypeModels(oldChanged)))throw Error('Older than156 affected fit');
  oldHistoryExclusionChecks++;
}
const empty=M.fitTypeModels([]);checkFit(empty);
for(const ticket of [[1,2,3,4,5,6],[40,41,42,43,44,45],[1,11,21,31,41,45],draws[0].numbers]){
  const scores=M.scoreTicket(empty,ticket);
  if(M.IDS.some(id=>Math.abs(scores[id].experimentalTicketProbability-1/T.TOTAL)>1e-20))throw Error('Prior does not recover uniform');
}
const result={passed:true,normalizationChecks,mixtureChecks,futurePerturbationChecks,oldHistoryExclusionChecks,emptyHistoryUniformChecks:4*12,rows};
fs.writeFileSync(path.join(__dirname,'node-score-audit-samples.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,rows:rows.length},null,2));
