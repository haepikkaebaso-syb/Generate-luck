'use strict';
// 오프라인 지원: 온라인이면 항상 서버의 최신본을 쓰고 사본을 갱신한다. 연결이 없거나 너무 느릴 때만 사본을 쓴다.
const CACHE='lotto-atelier-7ab216b2f5f0d32f',SHELL=['./','manifest.webmanifest','icon.svg'],TIMEOUT=4000;
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(SHELL.map(async path=>{
    const response=await fetch(path,{cache:'reload'});
    if(!response.ok)throw new Error('앱 파일을 저장하지 못했습니다.');
    await cache.put(path,response);
  }))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lotto-atelier-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
async function stored(request){
  const cache=await caches.open(CACHE);
  if(request.mode==='navigate')return await cache.match('./')||cache.match(request,{ignoreSearch:true});
  return cache.match(request,{ignoreSearch:true});
}
async function respond(request,event){
  let timer;
  const network=fetch(request,{cache:'no-cache'}).then(async response=>{
    if(response.ok&&response.type==='basic')await (await caches.open(CACHE)).put(request.mode==='navigate'?'./':request,response.clone());
    return response;
  });
  // Keep a slow network request alive after returning an offline copy.
  event.waitUntil(network.catch(()=>{}));
  const slow=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),TIMEOUT);});
  try{
    // 느린 연결에서는 사본으로 먼저 열고, 늦게 도착한 최신본은 다음 실행을 위해 사본만 갱신한다.
    const first=await Promise.race([network,slow]);
    if(first)return first;
    network.catch(()=>{});
    return await stored(request)||await network;
  }catch(error){
    const copy=await stored(request);
    if(copy)return copy;
    throw error;
  }finally{clearTimeout(timer);}
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  if(new URL(request.url).pathname.endsWith('/version.json')){
    event.respondWith(fetch(request,{cache:'no-store'}));return;
  }
  event.respondWith(respond(request,event));
});
