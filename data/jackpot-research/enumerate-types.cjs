'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const T=require('./type-partitions.cjs');
const start=Date.now(),counts=T.enumerateCardinalities();
const digest=crypto.createHash('sha256').update(fs.readFileSync(require.resolve('./type-partitions.cjs'))).digest('hex');
const out={metadata:{createdAtUtc:new Date().toISOString(),method:'Every unordered six-number outcome enumerated exactly once through six nested increasing loops',total:counts.total,elapsedMilliseconds:Date.now()-start,moduleSha256:digest,historyInputUsed:false},partitions:counts.partitions};
fs.writeFileSync(path.join(__dirname,'exact-type-cardinalities.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({elapsedMs:Date.now()-start,partitions:counts.partitions.map(p=>({id:p.id,categories:p.categories.length,possible:p.categories.filter(c=>c.possible).length,total:p.categories.reduce((s,c)=>s+c.cardinality,0)}))},null,2));
