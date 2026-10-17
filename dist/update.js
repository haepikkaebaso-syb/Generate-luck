(function(){
  'use strict';
  const button=document.getElementById('check-update'),status=document.getElementById('update-status');
  if(!button||!status)return;
  if(location.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
    button.hidden=true;status.textContent='오프라인 파일입니다. 최신 번호는 배포 사이트에서 확인할 수 있습니다.';return;
  }
  const release=document.querySelector('meta[name="lotto-release"]')?.content;
  let available=null,busy=false,lastCheck=0;
  async function check(manual=false){
    if(busy)return;
    busy=true;button.disabled=true;lastCheck=Date.now();
    if(manual)status.textContent='최신 버전을 확인하고 있습니다…';
    try{
      const response=await fetch(new URL('version.json',location.href),{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const info=await response.json();
      if(!/^[a-f0-9]{16}$/.test(info.release)||!Number.isInteger(info.lastRound)||info.lastRound<1)throw new Error('Invalid version');
      if(info.release!==release){
        available=info.release;button.textContent='새 버전 열기';
        status.textContent='새 버전이 있습니다 · 공식 '+info.lastRound+'회까지 반영. 보관한 번호는 유지됩니다.';
      }else{
        available=null;button.textContent='업데이트 확인';
        status.textContent='최신 배포 버전입니다 · 공식 '+info.lastRound+'회까지 반영';
      }
    }catch{
      status.textContent='업데이트를 확인하지 못했습니다. 인터넷 연결 후 다시 확인해 주세요.';
    }finally{busy=false;button.disabled=false;}
  }
  button.addEventListener('click',()=>{
    if(available){const url=new URL(location.href);url.searchParams.set('v',available);location.replace(url.href);}
    else check(true);
  });
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
  }
  window.addEventListener('online',()=>check());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastCheck>60000)check();});
  check();
})();
