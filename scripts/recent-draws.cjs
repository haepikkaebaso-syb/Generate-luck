'use strict';
// 연구용 data/draws.json(해시 고정, 720~1241회)은 그대로 두고, 그 이후 회차만 data/recent-draws.json에 쌓는다.
// 앱의 당첨번호 대조·과거 1등 번호 회피에만 쓰이며, 분석 모형에는 들어가지 않는다.
const fs=require('node:fs'),path=require('node:path');
const FILE=path.resolve(__dirname,'../data/recent-draws.json');
const DAY=86400000;
function parseRow(row){
  const round=Number(row.ltEpsd),ymd=String(row.ltRflYmd),date=ymd.slice(0,4)+'-'+ymd.slice(4,6)+'-'+ymd.slice(6,8);
  const numbers=[1,2,3,4,5,6].map(i=>Number(row['tm'+i+'WnNo'])),bonus=Number(row.bnsWnNo);
  const draw={round,date,numbers,bonus,firstPrizeWinners:Number(row.rnk1WnNope),firstPrizePerWinner:Number(row.rnk1WnAmt)};
  check(draw);return draw;
}
function check(draw){
  const fail=why=>{throw new Error('공식 응답 검증 실패('+draw.round+'회): '+why);};
  if(!Number.isInteger(draw.round)||draw.round<1)fail('회차');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(draw.date)||new Date(draw.date+'T00:00:00Z').getUTCDay()!==6)fail('추첨일이 토요일이 아님');
  const all=[...draw.numbers,draw.bonus];
  if(draw.numbers.length!==6||all.some(n=>!Number.isInteger(n)||n<1||n>45)||new Set(all).size!==7)fail('번호 범위·중복');
  if(draw.numbers.some((n,i)=>i&&n<=draw.numbers[i-1]))fail('번호 정렬');
  if(![draw.firstPrizeWinners,draw.firstPrizePerWinner].every(v=>Number.isInteger(v)&&v>=0))fail('1등 당첨 정보');
}
// recent must continue the frozen data without gaps, one draw per week.
function validate(frozen,recent){
  let previous=frozen.at(-1);
  for(const draw of recent){
    check(draw);
    if(draw.round!==previous.round+1)throw new Error('회차가 이어지지 않습니다: '+previous.round+' → '+draw.round);
    if(Date.parse(draw.date)-Date.parse(previous.date)!==7*DAY)throw new Error('추첨일 간격이 7일이 아닙니다: '+draw.round+'회');
    previous=draw;
  }
  return recent;
}
const load=()=>fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE,'utf8')).draws:[];
module.exports={FILE,parseRow,check,validate,load};
