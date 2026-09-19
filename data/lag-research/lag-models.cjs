(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LottoLag=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const P0=6/45, PRIOR=80, MIN_PAIR_SUPPORT=8;
  const MODELS=[
    {id:'uniform',label:'균등 기준',type:'uniform',lags:[]},
    {id:'lag_single1',label:'직전 회차 단일 번호 조건',type:'single',lags:[1]},
    {id:'lag_single123',label:'1·2·3회 전 단일 번호 조건',type:'single',lags:[1,2,3]},
    {id:'lag_single1to10',label:'1~10회 전 단일 번호 조건',type:'single',lags:[1,2,3,4,5,6,7,8,9,10]},
    {id:'lag_pair123',label:'1·2·3회 전 번호쌍 조건',type:'pair',lags:[1,2,3]},
    {id:'lag_similarity123',label:'1·2·3회 전 여섯 번호 유사도',type:'similarity',lags:[1,2,3]}
  ];
  function validateHistory(history){
    if(!Array.isArray(history))throw new TypeError('history must be an array');
    for(const d of history){
      if(!d||!Array.isArray(d.numbers)||d.numbers.length!==6||new Set(d.numbers).size!==6||d.numbers.some(n=>!Number.isInteger(n)||n<1||n>45))throw new TypeError('Every history row needs six distinct numbers from 1 through 45');
    }
  }
  function mean(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
  function fitLagWeights(history,id){
    const model=MODELS.find(m=>m.id===id);
    if(!model)throw new Error('Unknown lag model: '+id);
    validateHistory(history);
    const t=history.length, weights=Array(45).fill(0);
    const diagnostics={model:id,historyDrawCount:t,predictionIndex:t,historyFirstRound:t?history[0].round??null:null,historyLastRound:t?history[t-1].round??null:null,priorStrength:PRIOR,priorProbability:P0,minimumPairSupport:model.type==='pair'?MIN_PAIR_SUPPORT:null,aggregation:'arithmetic mean of active condition probability/prior ratios',activeConditionCount:0,lags:[]};
    if(model.type==='uniform')return {weights:Array(45).fill(1),diagnostics:{...diagnostics,uniformFallback:false}};
    const membership=history.map(d=>{const arr=new Uint8Array(45);for(const n of d.numbers)arr[n-1]=1;return arr;});
    let aggregateCount=0;
    for(const lag of model.lags){
      const sourceIndex=t-lag,trainingPairCount=Math.max(0,t-lag);
      if(sourceIndex<0){diagnostics.lags.push({lag,sourceIndex,sourceRound:null,trainingPairCount:0,available:false});continue;}
      const current=history[sourceIndex].numbers;
      const info={lag,available:true,sourceIndex,sourceRound:history[sourceIndex].round??null,sourceNumbers:current.slice(),trainingPairCount,trainingMaxSourceIndex:trainingPairCount?trainingPairCount-1:null,trainingMaxTargetIndex:trainingPairCount?t-1:null,activeConditionCount:0};
      if(model.type==='single'||model.type==='pair'){
        const conditions=model.type==='single'?current.map(n=>[n]):current.flatMap((a,i)=>current.slice(i+1).map(b=>[a,b]));
        const supports=Array(conditions.length).fill(0);
        const counts=conditions.map(()=>Array(45).fill(0));
        // Historical source s and target s+lag are both in history. In particular s+lag<t.
        for(let s=0;s<trainingPairCount;s++){
          const sourceMembership=membership[s],target=history[s+lag].numbers;
          for(let c=0;c<conditions.length;c++){
            const condition=conditions[c];
            if(condition.every(n=>sourceMembership[n-1])){
              supports[c]++;
              for(const targetNumber of target)counts[c][targetNumber-1]++;
            }
          }
        }
        info.conditions=conditions.map((antecedent,c)=>({antecedent:antecedent.slice(),support:supports[c],used:model.type==='single'||supports[c]>=MIN_PAIR_SUPPORT}));
        for(let c=0;c<conditions.length;c++){
          if(model.type==='pair'&&supports[c]<MIN_PAIR_SUPPORT)continue;
          aggregateCount++;info.activeConditionCount++;
          for(let n=0;n<45;n++)weights[n]+=(counts[c][n]+PRIOR*P0)/((supports[c]+PRIOR)*P0);
        }
        info.supportMin=Math.min(...supports);info.supportMax=Math.max(...supports);info.supportMean=mean(supports);
      }else{
        let effectiveSupport=0,positiveSimilarityCount=0;
        const targetCounts=Array(45).fill(0),overlapHistogram=Array(7).fill(0);
        for(let s=0;s<trainingPairCount;s++){
          let overlap=0;for(const n of current)overlap+=membership[s][n-1];
          overlapHistogram[overlap]++;
          const similarity=overlap*(overlap-1)/30;
          if(similarity>0){positiveSimilarityCount++;effectiveSupport+=similarity;for(const n of history[s+lag].numbers)targetCounts[n-1]+=similarity;}
        }
        aggregateCount++;info.activeConditionCount=1;
        for(let n=0;n<45;n++)weights[n]+=(targetCounts[n]+PRIOR*P0)/((effectiveSupport+PRIOR)*P0);
        info.effectiveWeightedSupport=effectiveSupport;info.positiveSimilarityCount=positiveSimilarityCount;info.sourceOverlapHistogram=overlapHistogram;
      }
      diagnostics.lags.push(info);
    }
    diagnostics.activeConditionCount=aggregateCount;
    diagnostics.uniformFallback=aggregateCount===0;
    if(!aggregateCount)return {weights:Array(45).fill(1),diagnostics};
    for(let n=0;n<45;n++)weights[n]/=aggregateCount;
    diagnostics.weightMin=Math.min(...weights);diagnostics.weightMax=Math.max(...weights);
    return {weights,diagnostics};
  }
  return {MODELS,P0,PRIOR,MIN_PAIR_SUPPORT,fitLagWeights};
});
