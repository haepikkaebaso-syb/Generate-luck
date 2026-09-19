'use strict';
const T=require('./type-partitions.cjs');
const COUNTS=require('./exact-type-cardinalities.json');
const PRIOR=156,LOOKBACK=156,IDS=['uniform',...T.PARTITIONS.map(p=>p.id),'type_mixture'];
function fitTypeModels(history){
 if(!Array.isArray(history))throw new Error('History must be an array');
 const recent=history.slice(-LOOKBACK),n=recent.length,counts=T.PARTITIONS.map(p=>Array(p.categories.length).fill(0));
 for(const draw of recent){const f=T.classify(draw.numbers);f.indices.forEach((category,i)=>counts[i][category]++);}
 const byPartition={};
 T.PARTITIONS.forEach((p,i)=>{
  const exact=COUNTS.partitions[i];if(exact.id!==p.id)throw new Error('Cardinality definition mismatch');
  byPartition[p.id]={historyCounts:counts[i],categoryProbabilities:exact.categories.map((c,j)=>{
   if(!c.cardinality&&counts[i][j])throw new Error('Observed impossible category');
   return (counts[i][j]+PRIOR*c.theoreticalProbability)/(n+PRIOR);
  })};
 });
 return {trainingDrawCount:n,lookback:LOOKBACK,priorStrength:PRIOR,historyFirstRound:n?recent[0].round??null:null,historyLastRound:n?recent[n-1].round??null:null,byPartition};
}
function scoreTicket(fitted,numbers){
 const f=T.classify(numbers),scores={uniform:{jointLogGain:0,experimentalTicketProbability:1/T.TOTAL}};
 T.PARTITIONS.forEach((p,i)=>{
  const index=f.indices[i],category=COUNTS.partitions[i].categories[index],probability=fitted.byPartition[p.id].categoryProbabilities[index],ticketP=probability/category.cardinality;
  scores[p.id]={jointLogGain:Math.log(T.TOTAL*ticketP),experimentalTicketProbability:ticketP,categoryKey:category.key,categoryIndex:index,trainingCategoryCount:fitted.byPartition[p.id].historyCounts[index],categoryProbability:probability,categoryCardinality:category.cardinality};
 });
 const componentScores=IDS.slice(0,-1).map(id=>scores[id].jointLogGain),maximum=Math.max(...componentScores);
 const mixtureLogGain=maximum+Math.log(componentScores.reduce((s,x)=>s+Math.exp(x-maximum),0)/11);
 scores.type_mixture={jointLogGain:mixtureLogGain,experimentalTicketProbability:Math.exp(mixtureLogGain)/T.TOTAL,normalizedComponents:11,componentProbability:1/11};
 return scores;
}
module.exports={PRIOR,LOOKBACK,IDS,fitTypeModels,scoreTicket};
