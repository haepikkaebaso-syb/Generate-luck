'use strict';
// 공식 결과를 모두 검증한 뒤 교체한다. 일시적인 접속 제한 페이지나 통신 실패에는 재시도한다.
const fs=require('node:fs'),path=require('node:path');
const R=require('./recent-draws.cjs');
const PAGE='https://m.dhlottery.co.kr/lt645/result',API='https://m.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do';
const FROZEN_FILE=path.resolve(__dirname,'../data/draws.json'),WEEK=7*86400000;
const BACKOFFS=[5000,15000,30000];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class OfficialResponseError extends Error{
  constructor(message,retryable=true){super(message);this.retryable=retryable;}
}

// 회차의 기준일은 검증된 연구 자료에서 가져온다. 토요일 21:40 KST 이후에는 그날 결과가 필요하다.
function expectedLatestRound(frozen,now=Date.now()){
  const anchor=frozen.at(-1),cutoff=Date.parse(anchor.date+'T21:40:00+09:00');
  if(!Number.isFinite(now)||!Number.isFinite(cutoff))throw new Error('최신 회차 확인에 사용할 시각이 올바르지 않습니다.');
  return anchor.round+Math.max(0,Math.floor((now-cutoff)/WEEK));
}

async function page(round,{fetchImpl=globalThis.fetch,wait=sleep,log=console.log,attempts=4}={}){
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetchImpl(API+'?srchDir=center&srchLtEpsd='+round,{headers:{Accept:'application/json',Referer:PAGE},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new OfficialResponseError('공식 API HTTP '+response.status,[408,425,429].includes(response.status)||response.status>=500);
      const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
      const text=await response.text();
      if(type.includes('html')||/^\s*<(?:!doctype\s+html|html|head|body)\b/i.test(text))throw new OfficialResponseError('공식 API가 JSON 대신 HTML 접속 제한·점검 페이지를 반환했습니다 (HTTP '+response.status+').');
      if(type&&!/^(?:application|text)\/(?:[\w.-]+\+)?json$/.test(type))throw new OfficialResponseError('공식 API 응답이 JSON 형식이 아닙니다 (Content-Type: '+type+').');
      let payload;
      try{payload=JSON.parse(text);}catch{throw new OfficialResponseError('공식 API JSON을 해석할 수 없습니다.');}
      if(!Array.isArray(payload?.data?.list))throw new OfficialResponseError('공식 API 응답에 data.list 배열이 없습니다.');
      return payload.data.list;
    }catch(error){
      const message=error instanceof OfficialResponseError?error.message:'공식 API 통신 실패 ('+(error.name==='TimeoutError'?'30초 시간 초과':error.name==='AbortError'?'요청 중단':'네트워크 오류')+').';
      if(error.retryable===false||attempt===attempts)throw new Error(message+' '+attempt+'회 시도 후 중단했습니다. 기존 자료는 유지합니다.');
      const delay=BACKOFFS[Math.min(attempt-1,BACKOFFS.length-1)];
      log(message+' '+delay/1000+'초 뒤 재시도합니다 ('+attempt+'/'+attempts+').');
      await wait(delay);
    }
  }
}

function writeAtomic(file,contents){
  // 같은 폴더에 완성된 임시 파일을 만든 후 rename하여 중단 시 원본이 잘리지 않도록 한다.
  const temporary=file+'.'+process.pid+'.'+require('node:crypto').randomUUID()+'.tmp';
  try{fs.writeFileSync(temporary,contents,{flag:'wx'});fs.renameSync(temporary,file);}
  finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}

async function update({frozen=JSON.parse(fs.readFileSync(FROZEN_FILE,'utf8')).draws.slice().sort((a,b)=>a.round-b.round),file=R.FILE,now=Date.now(),fetchImpl,wait,log=console.log}={}){
  const frozenLast=frozen.at(-1).round;
  const before=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')).draws:[];
  const byRound=new Map(before.filter(d=>d.round>frozenLast).map(d=>[d.round,d]));
  let exhausted=true;
  for(let cursor=Math.max(frozenLast,...byRound.keys()),guard=0;guard<60;guard++){
    const rows=(await page(cursor,{fetchImpl,wait,log})).map(R.parseRow).filter(d=>d.round>frozenLast);
    rows.forEach(d=>byRound.set(d.round,d));
    const newest=Math.max(cursor,...rows.map(d=>d.round));
    if(newest===cursor){exhausted=false;break;}
    cursor=newest;
  }
  if(exhausted)throw new Error('공식 API 조회 한도에 도달했습니다. 기존 자료는 유지합니다.');
  const draws=R.validate(frozen,[...byRound.values()].sort((a,b)=>a.round-b.round));
  const latest=draws.at(-1)?.round??frozenLast,expected=expectedLatestRound(frozen,now);
  if(latest<expected)throw new Error('최신 당첨번호 미반영: '+expected+'회까지 필요하지만 공식 API에서 '+latest+'회까지만 확인했습니다. 기존 자료는 유지하며 다음 예약 실행에서 재시도합니다.');
  if(JSON.stringify(draws)===JSON.stringify(before)){log('최신 회차 확인 완료: '+latest+'회 (변경 없음)');return {changed:false,latest,expected};}
  const output={schemaVersion:1,description:'data/draws.json 이후의 공식 당첨번호. 앱의 대조 기능 전용이며 분석 모형에는 쓰지 않습니다.',sourceApiUrl:API,after:frozenLast,draws};
  writeAtomic(file,JSON.stringify(output,null,2)+'\n');
  log(draws.length?'갱신: '+draws[0].round+'~'+latest+'회 ('+draws.length+'개), 최신 '+draws.at(-1).numbers.join(' ')+' + '+draws.at(-1).bonus:'연구 자료('+frozenLast+'회까지)에 합쳐진 회차를 정리했습니다.');
  return {changed:true,latest,expected};
}

if(require.main===module)update().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={PAGE,API,page,expectedLatestRound,writeAtomic,update};
