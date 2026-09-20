'use strict';
// 오프라인 지원: 온라인이면 항상 서버의 최신본을 쓰고 사본을 갱신한다. 연결이 없거나 너무 느릴 때만 사본을 쓴다.
const CACHE='lotto-atelier-v1',SHELL=['./','manifest.webmanifest','icon.svg'],TIMEOUT=4000;
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
async function stored(request){
  const cache=await caches.open(CACHE);
  return await cache.match(request,{ignoreSearch:true})||(request.mode==='navigate'?cache.match('./'):undefined);
}
async function respond(request){
  let timer;
  const network=fetch(request).then(async response=>{
    if(response.ok&&response.type==='basic')await (await caches.open(CACHE)).put(request,response.clone());
    return response;
  });
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
  event.respondWith(respond(request));
});
