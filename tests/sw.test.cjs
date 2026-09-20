'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.resolve(__dirname,'../dist/sw.js'),'utf8'),ORIGIN='https://example.test';

// A minimal service-worker host: one cache, a scriptable network, manual timers.
function host(){
  const listeners={},store=new Map(),timers=[];let network=async()=>{throw new Error('offline');};
  const keyOf=(request,ignoreSearch)=>{const url=new URL(typeof request==='string'?request:request.url,ORIGIN+'/app/');if(ignoreSearch)url.search='';return url.href;};
  const cache={addAll:async list=>{for(const item of list)store.set(keyOf(item),await network({url:keyOf(item)}));},put:async(request,response)=>{store.set(keyOf(request),response);},
    match:async(request,options)=>store.get(keyOf(request,options?.ignoreSearch))};
  const self={location:{origin:ORIGIN},addEventListener:(name,fn)=>{listeners[name]=fn;},skipWaiting:async()=>{},clients:{claim:async()=>{}}};
  vm.runInNewContext(code,{self,caches:{open:async()=>cache,keys:async()=>['old-cache','lotto-atelier-v1'],delete:async key=>{store.deleted=(store.deleted||[]).concat(key);}},
    fetch:request=>network(request),URL,Promise,setTimeout:(fn,ms)=>{timers.push(fn);return timers.length;},clearTimeout(){}});
  const run=async(name,event={})=>{let waited;listeners[name]({...event,waitUntil:p=>{waited=p;}});await waited;};
  const request=(url,extra={})=>({url:new URL(url,ORIGIN+'/app/').href,method:'GET',mode:'navigate',...extra});
  const fetchEvent=req=>{let answer=null;listeners.fetch({request:req,respondWith:p=>{answer=p;}});return answer;};
  const response=body=>({ok:true,type:'basic',body,clone(){return response(body);}});
  return {store,timers,run,request,fetchEvent,response,setNetwork:fn=>{network=fn;}};
}

test('설치할 때 앱 화면과 아이콘을 저장하고, 이전 버전 저장소는 지움',async()=>{
  const h=host();h.setNetwork(async r=>h.response('v1 '+r.url));
  await h.run('install');await h.run('activate');
  assert.deepEqual([...h.store.keys()].sort(),[ORIGIN+'/app/',ORIGIN+'/app/icon.svg',ORIGIN+'/app/manifest.webmanifest']);
  assert.deepEqual(h.store.deleted,['old-cache']);
});

test('온라인이면 서버의 최신본을 보여 주고 사본도 새것으로 교체',async()=>{
  const h=host();h.setNetwork(async()=>h.response('v1'));await h.run('install');
  h.setNetwork(async()=>h.response('v2'));
  assert.equal((await h.fetchEvent(h.request('./'))).body,'v2');
  assert.equal(h.store.get(ORIGIN+'/app/').body,'v2');
});

test('오프라인이면 저장해 둔 사본으로 열림(주소 뒤 ?… 가 달라도)',async()=>{
  const h=host();h.setNetwork(async()=>h.response('v1'));await h.run('install');
  h.setNetwork(async()=>{throw new Error('offline');});
  assert.equal((await h.fetchEvent(h.request('./?source=pwa'))).body,'v1');
  assert.equal((await h.fetchEvent(h.request('index.html'))).body,'v1'); // 저장본이 없는 화면 주소는 기본 화면으로
  await assert.rejects(h.fetchEvent(h.request('missing.png',{mode:'no-cors'})),/offline/);
});

test('연결이 너무 느리면 사본으로 먼저 열고, 늦게 온 최신본은 다음 실행용으로 저장',async()=>{
  const h=host();h.setNetwork(async()=>h.response('v1'));await h.run('install');
  let arrive;h.setNetwork(()=>new Promise(resolve=>{arrive=resolve;}));
  const answer=h.fetchEvent(h.request('./'));
  await new Promise(r=>setImmediate(r));h.timers.at(-1)(); // 4초 경과
  assert.equal((await answer).body,'v1');
  arrive(h.response('v2'));await new Promise(r=>setImmediate(r));
  assert.equal(h.store.get(ORIGIN+'/app/').body,'v2');
});

test('오류 응답은 저장하지 않고, 다른 사이트 요청이나 GET이 아닌 요청은 건드리지 않음',async()=>{
  const h=host();h.setNetwork(async()=>h.response('v1'));await h.run('install');
  h.setNetwork(async()=>({ok:false,type:'basic',body:'404',clone(){return this;}}));
  assert.equal((await h.fetchEvent(h.request('./'))).body,'404');assert.equal(h.store.get(ORIGIN+'/app/').body,'v1');
  assert.equal(h.fetchEvent({url:'https://other.test/x',method:'GET',mode:'cors'}),null);
  assert.equal(h.fetchEvent(h.request('./',{method:'POST'})),null);
});

test('앱은 웹 주소에서만 등록하고 배포 폴더에 같은 파일이 들어 있음',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../dist/app.js'),'utf8');
  assert.match(app,/'serviceWorker' in navigator&&\(location\.protocol==='https:'\|\|location\.hostname==='localhost'\)/);
  assert.equal(fs.readFileSync(path.resolve(__dirname,'../docs/sw.js'),'utf8'),code);
});
