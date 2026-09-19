(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.LottoTypes=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TOTAL=8145060,PRIMES=[2,3,5,7,11,13,17,19,23,29,31,37,41,43];
const primeMask=Array(46).fill(0);PRIMES.forEach(n=>primeMask[n]=1);
const digitPopCount=Array(1024).fill(0);for(let i=1;i<1024;i++)digitPopCount[i]=digitPopCount[i>>1]+(i&1);
const SUM_BINS=[[21,89],[90,119],[120,149],[150,179],[180,255]],SPAN_BINS=[[0,19],[20,29],[30,39],[40,44]];
const categories=(start,end,suffix='')=>Array.from({length:end-start+1},(_,i)=>({key:String(start+i),label:String(start+i)+suffix}));
const decadeCategories=[],decadeLookup=new Int16Array(16807);decadeLookup.fill(-1);
for(let a=0;a<=6;a++)for(let b=0;b<=6-a;b++)for(let c=0;c<=6-a-b;c++)for(let d=0;d<=6-a-b-c;d++){
 const e=6-a-b-c-d;if(e>5)continue;const occupancy=[a,b,c,d,e],code=a+7*b+49*c+343*d+2401*e;
 decadeLookup[code]=decadeCategories.length;decadeCategories.push({key:occupancy.join(','),label:occupancy.join(' · '),occupancy});
}
const sumCategories=SUM_BINS.map(([a,b])=>({key:a+'-'+b,label:a+'~'+b}));
const jointAdjacent=[],jointLow=[];
for(let s=0;s<5;s++)for(let odd=0;odd<=6;odd++){
 for(let adjacent=0;adjacent<=5;adjacent++)jointAdjacent.push({key:sumCategories[s].key+'|odd='+odd+'|adjacent='+adjacent,label:'합계 '+sumCategories[s].label+' / 홀수 '+odd+' / 연속쌍 '+adjacent,sumBin:s,odd,adjacent});
 for(let low=0;low<=6;low++)jointLow.push({key:sumCategories[s].key+'|odd='+odd+'|low='+low,label:'합계 '+sumCategories[s].label+' / 홀수 '+odd+' / 22이하 '+low,sumBin:s,odd,low});
}
const PARTITIONS=[
 {id:'odd_count',label:'홀수 개수',categories:categories(0,6,'개')},
 {id:'low_count',label:'22 이하 번호 개수',categories:categories(0,6,'개')},
 {id:'sum_bin',label:'여섯 번호 합계',categories:sumCategories},
 {id:'adjacent_pairs',label:'인접 연속번호 쌍',categories:categories(0,5,'쌍')},
 {id:'last_digit_distinct',label:'끝자리 종류 개수',categories:categories(1,6,'종류')},
 {id:'prime_count',label:'소수 개수',categories:categories(0,6,'개')},
 {id:'decade_occupancy',label:'번호 구간별 개수',groupLabels:['1~10','11~20','21~30','31~40','41~45'],categories:decadeCategories},
 {id:'span_bin',label:'최댓값−최솟값',categories:SPAN_BINS.map(([a,b])=>({key:a+'-'+b,label:a+'~'+b}))},
 {id:'joint_sum_odd_adjacent',label:'합계 × 홀수 × 연속쌍',categories:jointAdjacent},
 {id:'joint_sum_odd_low',label:'합계 × 홀수 × 저번호',categories:jointLow}
];
function featureIndices(a,b,c,d,e,f){
 const numbers=[a,b,c,d,e,f],sum=a+b+c+d+e+f,odd=(a&1)+(b&1)+(c&1)+(d&1)+(e&1)+(f&1),low=(a<=22)+(b<=22)+(c<=22)+(d<=22)+(e<=22)+(f<=22),adjacent=(b-a===1)+(c-b===1)+(d-c===1)+(e-d===1)+(f-e===1);
 const digits=(1<<(a%10))|(1<<(b%10))|(1<<(c%10))|(1<<(d%10))|(1<<(e%10))|(1<<(f%10));
 const prime=primeMask[a]+primeMask[b]+primeMask[c]+primeMask[d]+primeMask[e]+primeMask[f];
 const powers=[1,7,49,343,2401];let decadeCode=0;for(const n of numbers)decadeCode+=powers[Math.floor((n-1)/10)];
 const sumBin=sum<90?0:sum<120?1:sum<150?2:sum<180?3:4,span=f-a,spanBin=span<20?0:span<30?1:span<40?2:3;
 return [odd,low,sumBin,adjacent,digitPopCount[digits]-1,prime,decadeLookup[decadeCode],spanBin,sumBin*42+odd*6+adjacent,sumBin*49+odd*7+low];
}
function classify(input){
 if(!Array.isArray(input)||input.length!==6||new Set(input).size!==6||Array.from(input).some(n=>!Number.isInteger(n)||n<1||n>45))throw new Error('Six distinct integers1..45 are required');
 const n=input.slice().sort((a,b)=>a-b),indices=featureIndices(...n),byPartition={};
 PARTITIONS.forEach((p,i)=>byPartition[p.id]={index:indices[i],key:p.categories[indices[i]].key,label:p.categories[indices[i]].label});
 return {numbers:n,sum:n.reduce((a,b)=>a+b,0),span:n[5]-n[0],indices,byPartition};
}
function enumerateCardinalities(){
 const counts=PARTITIONS.map(p=>Array(p.categories.length).fill(0));let total=0;
 for(let a=1;a<=40;a++)for(let b=a+1;b<=41;b++)for(let c=b+1;c<=42;c++)for(let d=c+1;d<=43;d++)for(let e=d+1;e<=44;e++)for(let f=e+1;f<=45;f++){
  const indices=featureIndices(a,b,c,d,e,f);for(let i=0;i<10;i++)counts[i][indices[i]]++;total++;
 }
 if(total!==TOTAL)throw new Error('Enumeration cardinality mismatch');
 return {total,partitions:PARTITIONS.map((p,i)=>({...p,categories:p.categories.map((c,j)=>({...c,index:j,cardinality:counts[i][j],theoreticalProbability:counts[i][j]/TOTAL,possible:counts[i][j]>0}))}))};
}
return {TOTAL,PRIMES,SUM_BINS,SPAN_BINS,PARTITIONS,classify,enumerateCardinalities};
});
