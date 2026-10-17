'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.resolve(__dirname,'../dist/update.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function host({offline=false,file=false,release='aaaaaaaaaaaaaaaa'}={}){
  const handlers={},button={textContent:'업데이트 확인',disabled:false,hidden:false,addEventListener:(n,fn)=>{handlers[n]=fn;}},status={textContent:''};
  let network=offline?()=>Promise.reject(new Error('offline')):async()=>({ok:true,json:async()=>({release,lastRound:1246})});
  const requests=[],navigation=[];
  const location={protocol:file?'file:':'https:',hostname:file?'':'example.test',href:file?'file:///app.html':'https://example.test/app/',replace:url=>navigation.push(url)};
  const document={getElementById:id=>id==='check-update'?button:status,querySelector:()=>({content:'aaaaaaaaaaaaaaaa'}),addEventListener(){}};
  vm.runInNewContext(code,{document,location,navigator:{},window:{addEventListener(){}},URL,AbortSignal,Date,fetch:async(url,options)=>{requests.push(options);return network();}});
  return {button,status,requests,navigation,click:()=>handlers.click(),setNetwork:fn=>{network=fn;}};
}
test('현재 배포 확인과 새 버전 열기: 자동 새로고침 없이 사용자가 적용',async()=>{
  const h=host({release:'bbbbbbbbbbbbbbbb'});await tick();
  assert.match(h.status.textContent,/1246회/);assert.equal(h.button.textContent,'새 버전 열기');
  assert.equal(h.navigation.length,0);assert.equal(h.requests[0].cache,'no-store');
  h.click();assert.equal(new URL(h.navigation[0]).searchParams.get('v'),'bbbbbbbbbbbbbbbb');
});
test('오프라인 확인 실패를 최신 버전으로 오인하지 않고 재시도 가능',async()=>{
  const h=host({offline:true});await tick();assert.match(h.status.textContent,/확인하지 못/);assert.equal(h.button.disabled,false);
  h.setNetwork(async()=>({ok:true,json:async()=>({release:'aaaaaaaaaaaaaaaa',lastRound:1246})}));h.click();await tick();
  assert.match(h.status.textContent,/최신 배포 버전/);
});
test('직접 연 HTML에서는 네트워크나 서비스 워커를 사용하지 않음',async()=>{
  const h=host({file:true});await tick();assert.equal(h.button.hidden,true);assert.equal(h.requests.length,0);assert.match(h.status.textContent,/오프라인 파일/);
});
