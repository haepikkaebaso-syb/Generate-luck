'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const R=require('../scripts/recent-draws.cjs'),source=require('../data/draws.json');
const row=(round,ymd,numbers,bonus)=>({ltEpsd:round,ltRflYmd:ymd,...Object.fromEntries(numbers.map((n,i)=>['tm'+(i+1)+'WnNo',n])),bnsWnNo:bonus,rnk1WnNope:9,rnk1WnAmt:3281029250});

test('공식 응답 한 줄을 검증해 앱 형식으로 변환',()=>{
 assert.deepEqual(R.parseRow(row(1242,'20260919',[2,4,10,16,31,41],9)),{round:1242,date:'2026-09-19',numbers:[2,4,10,16,31,41],bonus:9,firstPrizeWinners:9,firstPrizePerWinner:3281029250});
 assert.throws(()=>R.parseRow(row(1242,'20260918',[2,4,10,16,31,41],9)),/토요일/);
 assert.throws(()=>R.parseRow(row(1242,'20260919',[2,4,10,16,31,46],9)),/번호/);
 assert.throws(()=>R.parseRow(row(1242,'20260919',[2,4,10,16,31,41],41)),/번호/);
 assert.throws(()=>R.parseRow(row(1242,'20260919',[4,2,10,16,31,41],9)),/정렬/);
 assert.throws(()=>R.parseRow({ltEpsd:1242,ltRflYmd:'20260919'}),/번호/);
});

test('추가 회차는 연구 자료 바로 다음부터 빠짐없이 매주 이어져야 함',()=>{
 const a=R.parseRow(row(1242,'20260919',[2,4,10,16,31,41],9)),b=R.parseRow(row(1243,'20260926',[1,8,15,22,29,36],43));
 assert.equal(R.validate(source.draws,[a,b]).length,2);
 assert.throws(()=>R.validate(source.draws,[b]),/이어지지/);
 assert.throws(()=>R.validate(source.draws,[a,{...b,date:'2026-10-03'}]),/7일/);
 assert.equal(R.validate(source.draws,[]).length,0);
});

test('저장된 추가 회차 파일과 빌드된 앱 자료가 일치하고 연구 자료는 그대로',()=>{
 const recent=R.validate(source.draws,R.load()),context={window:{}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../dist/draws.js'),'utf8'),context);
 const built=context.window.LOTTO_DATA,expected=[...source.draws,...recent];
 assert.equal(built.draws.length,expected.length);
 assert.equal(built.metadata.lastRound,expected.at(-1).round);assert.equal(built.metadata.lastDrawDate,expected.at(-1).date);
 assert.equal(built.metadata.firstRound,source.metadata.firstRound);
 for(const [i,d] of expected.entries())assert.deepEqual(JSON.parse(JSON.stringify(built.draws[i])),{round:d.round,date:d.date,numbers:d.numbers,bonus:d.bonus});
 assert.equal(context.window.LOTTO_SPLIT.sourceRounds.last,source.metadata.lastRound); // 분석 모형은 자동 갱신분을 쓰지 않음
});
