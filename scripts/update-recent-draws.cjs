'use strict';
// 동행복권 공식 결과 API에서 data/draws.json 이후 회차를 받아 data/recent-draws.json을 갱신한다.
// 새 회차가 없으면 파일을 건드리지 않는다. GitHub Actions(.github/workflows/update-draws.yml)와 수동 실행 공용.
const fs=require('node:fs'),path=require('node:path');
const R=require('./recent-draws.cjs');
const PAGE='https://m.dhlottery.co.kr/lt645/result',API='https://m.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do';
const frozen=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/draws.json'),'utf8')).draws.slice().sort((a,b)=>a.round-b.round);
const frozenLast=frozen.at(-1).round;
async function page(round){
  const response=await fetch(API+'?srchDir=center&srchLtEpsd='+round,{headers:{Accept:'application/json',Referer:PAGE},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('공식 API 응답 오류: HTTP '+response.status);
  const list=(await response.json())?.data?.list;
  if(!Array.isArray(list))throw new Error('공식 API 응답 형식이 바뀌었습니다.');
  return list;
}
(async()=>{
  const before=R.load(),byRound=new Map(before.map(d=>[d.round,d]));
  // 이미 아는 회차를 기준으로 요청하면 그 이후 발표분이 함께 온다. 더 나오지 않을 때까지 반복한다.
  for(let cursor=Math.max(frozenLast,...byRound.keys()),guard=0;guard<60;guard++){
    const rows=(await page(cursor)).map(R.parseRow).filter(d=>d.round>frozenLast);
    rows.forEach(d=>byRound.set(d.round,d)); // 1등 당첨금이 뒤늦게 확정되는 경우 기존 회차도 최신 값으로 덮어쓴다
    const newest=Math.max(cursor,...rows.map(d=>d.round));
    if(newest===cursor)break;
    cursor=newest;
  }
  const draws=R.validate(frozen,[...byRound.values()].sort((a,b)=>a.round-b.round));
  if(JSON.stringify(draws)===JSON.stringify(before)){console.log('새 회차 없음 (최신 '+(draws.at(-1)?.round??frozenLast)+'회)');return;}
  const output={schemaVersion:1,description:'data/draws.json 이후의 공식 당첨번호. 앱의 대조 기능 전용이며 분석 모형에는 쓰지 않습니다.',sourceApiUrl:API,after:frozenLast,draws};
  fs.writeFileSync(R.FILE,JSON.stringify(output,null,2)+'\n');
  console.log('갱신: '+draws[0].round+'~'+draws.at(-1).round+'회 ('+draws.length+'개), 최신 '+draws.at(-1).numbers.join(' ')+' + '+draws.at(-1).bonus);
})().catch(error=>{console.error(error.message);process.exit(1);});
