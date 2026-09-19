'use strict';
const fs=require('fs'),path=require('path');
const T=require('C:/Users/Public/Documents/ESTsoft/CreatorTemp/lotto-jackpot-types-20260913/type-partitions.cjs');
const draws=JSON.parse(fs.readFileSync('D:/로또 당첨번호 발생기/data/draws.json','utf8').replace(/^\uFEFF/,''));
const samples=draws.draws.map(d=>d.numbers);
let seed=6452026;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
for(let j=0;j<1000;j++){const ns=new Set();while(ns.size<6)ns.add(1+Math.floor(random()*45));samples.push([...ns]);}
for(const ns of [[1,2,3,4,5,6],[40,41,42,43,44,45],[1,10,20,30,40,45],[1,11,21,31,41,45]])samples.push(ns);
let invalidRejected=0;
for(const input of [[],[1,2,3,4,5],[1,2,3,4,5,6,7],[1,2,3,4,5,5],[0,2,3,4,5,6],[1,2,3,4,5,46],[1,2,3,4,5,6.5],['1',2,3,4,5,6]]){
  try{T.classify(input);}catch(e){invalidRejected++;}
}
if(invalidRejected!==8)throw Error('Invalid input not rejected');
fs.writeFileSync(path.join(__dirname,'classification-samples-node.json'),JSON.stringify({invalidRejected,samples:samples.map(numbers=>({numbers,result:T.classify(numbers)}))},null,2));
