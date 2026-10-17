'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const U=require('../scripts/update-recent-draws.cjs'),R=require('../scripts/recent-draws.cjs');
const frozen=[{round:1244,date:'2026-10-03'}];
const row=(round,date,numbers=[1,8,15,22,29,36],bonus=43)=>({ltEpsd:round,ltRflYmd:date,...Object.fromEntries(numbers.map((n,i)=>['tm'+(i+1)+'WnNo',n])),bnsWnNo:bonus,rnk1WnNope:9,rnk1WnAmt:3281029250});
const a=row(1245,'20261010'),b=row(1246,'20261017');
const response=(body,type='application/json; charset=utf-8',status=200)=>({ok:status>=200&&status<300,status,headers:{get:()=>type},text:async()=>body});
const json=rows=>response(JSON.stringify({data:{list:rows}}));
function fixture(t,draws=[]){
  // 실제 데이터와 같은 작업 폴더에서 Windows의 기존 파일 교체도 검증한다.
  const dir=fs.mkdtempSync(path.resolve(__dirname,'../.tmp-updater-')),file=path.join(dir,'recent.json');
  fs.writeFileSync(file,JSON.stringify({schemaVersion:1,after:1244,draws},null,2)+'\n');
  t.after(()=>{for(const entry of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,entry));fs.rmdirSync(dir);});
  return {file,dir,before:fs.readFileSync(file,'utf8')};
}
const quiet=()=>{};

test('예상 최신 회차는 자료의 기준일과 KST 토요일21:40을 사용한다',()=>{
  for(const [time,round] of [['2026-10-10T21:39:59+09:00',1244],['2026-10-10T21:40:00+09:00',1245],['2026-10-17T21:39:59+09:00',1245],['2026-10-17T21:40:00+09:00',1246],['2026-10-18T08:17:00+09:00',1246]])assert.equal(U.expectedLatestRound(frozen,Date.parse(time)),round,time);
  assert.equal(U.expectedLatestRound([{round:500,date:'2026-10-03'}],Date.parse('2026-10-18T00:00:00+09:00')),502);
});

test('HTTP200 HTML을 재시도하고 정상 JSON이 오면 진행하며 본문은 로그에 남기지 않는다',async()=>{
  const waits=[],logs=[],queue=[response('<html>PRIVATE PAGE CONTENT</html>','text/html'),json([b])];
  const rows=await U.page(1245,{fetchImpl:async()=>queue.shift(),wait:async ms=>waits.push(ms),log:s=>logs.push(s)});
  assert.deepEqual(rows,[b]);assert.deepEqual(waits,[5000]);assert.match(logs.join('\n'),/JSON 대신 HTML/);assert.doesNotMatch(logs.join('\n'),/PRIVATE PAGE/);
});

test('네트워크·HTTP503·잘못된 JSON은 정해진 횟수와 대기 시간 안에서 재시도한다',async()=>{
  let calls=0;const waits=[];
  const rows=await U.page(1245,{fetchImpl:async()=>{calls++;if(calls===1)throw new TypeError('connection failed');if(calls===2)return response('', 'text/html',503);if(calls===3)return response('{broken');return json([b]);},wait:async ms=>waits.push(ms),log:quiet});
  assert.deepEqual(rows,[b]);assert.equal(calls,4);assert.deepEqual(waits,[5000,15000,30000]);
});

test('복구할 수 없는 HTTP404는 반복 요청하지 않는다',async()=>{
  let calls=0;
  await assert.rejects(U.page(1245,{fetchImpl:async()=>{calls++;return response('', 'text/html',404);},wait:async()=>assert.fail('unexpected retry'),log:quiet}),/HTTP 404.*1회/);
  assert.equal(calls,1);
});

test('HTML 제한 페이지가 계속 오면 실패하고 기존 파일을 바꾸지 않는다',async t=>{
  const f=fixture(t,[R.parseRow(a)]);let calls=0;
  await assert.rejects(U.update({frozen,file:f.file,now:Date.parse('2026-10-18T08:17:00+09:00'),fetchImpl:async()=>{calls++;return response('<html>blocked</html>','application/json');},wait:async()=>{},log:quiet}),/JSON 대신 HTML.*4회/);
  assert.equal(calls,4);assert.equal(fs.readFileSync(f.file,'utf8'),f.before);assert.deepEqual(fs.readdirSync(f.dir),['recent.json']);
});

test('발표 예정 회차가 없으면 정상 성공으로 표시하거나 일부 결과로 덮어쓰지 않는다',async t=>{
  const f=fixture(t);
  await assert.rejects(U.update({frozen,file:f.file,now:Date.parse('2026-10-18T08:17:00+09:00'),fetchImpl:async()=>json([a]),log:quiet}),/1246회까지 필요.*1245회까지만/);
  assert.equal(fs.readFileSync(f.file,'utf8'),f.before);
});

test('번호 오류와 회차 누락을 발견하면 기존 데이터가 보존된다',async t=>{
  for(const invalid of [{...b,tm2WnNo:1},b]){
    const f=fixture(t);
    await assert.rejects(U.update({frozen,file:f.file,now:Date.parse('2026-10-18T08:17:00+09:00'),fetchImpl:async()=>json([invalid]),log:quiet}),/검증 실패|이어지지/);
    assert.equal(fs.readFileSync(f.file,'utf8'),f.before);assert.deepEqual(fs.readdirSync(f.dir),['recent.json']);
  }
});

test('최신 회차를 검증한 후 원자적으로 저장하고 다음 실행은 변경 없이 끝난다',async t=>{
  const f=fixture(t,[R.parseRow(a)]),logs=[];
  const options={frozen,file:f.file,now:Date.parse('2026-10-18T08:17:00+09:00'),fetchImpl:async()=>json([a,b]),log:s=>logs.push(s)};
  assert.deepEqual(await U.update(options),{changed:true,latest:1246,expected:1246});
  const written=fs.readFileSync(f.file,'utf8');assert.deepEqual(JSON.parse(written).draws,[R.parseRow(a),R.parseRow(b)]);assert.deepEqual(fs.readdirSync(f.dir),['recent.json']);
  const modified=fs.statSync(f.file).mtimeMs;
  assert.deepEqual(await U.update(options),{changed:false,latest:1246,expected:1246});
  assert.equal(fs.readFileSync(f.file,'utf8'),written);assert.equal(fs.statSync(f.file).mtimeMs,modified);assert.match(logs.at(-1),/최신 회차 확인 완료: 1246회/);
});

test('공식 응답 형식이 바뀌어도 본문 전체를 출력하지 않는다',async()=>{
  const logs=[];
  await assert.rejects(U.page(1245,{fetchImpl:async()=>response('{"secret":"PRIVATE BODY"}'),wait:async()=>{},log:s=>logs.push(s)}),/data.list 배열/);
  assert.doesNotMatch(logs.join('\n'),/PRIVATE BODY/);
});
