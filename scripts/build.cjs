'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/draws.json'),'utf8'));
const C=require(path.join(dist,'core.js'));
if(data.metadata.sourceType!=='official-primary'||!data.metadata.completeRequestedWindow||data.draws.length!==data.metadata.drawCount||data.draws.some(d=>!C.validNumbers(d.numbers,6)))throw new Error('공식 추첨 자료 검증에 실패했습니다.');
const templates=require('../data/portfolio-templates.json'),P=require('../dist/portfolio.js');
const provenance=require('../data/portfolio-provenance.json');
for(const file of provenance.files){
  const hash=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,file.path))).digest('hex');
  if(hash!==file.sha256)throw new Error('조합 설계 검증 원본 변경: '+file.path);
}
for(let m=1;m<=20;m++){
  const entry=templates.templates[m],actual=P.analyze(entry.tickets);
  if(actual.games!==m||actual.probabilities[3].favorable!==entry.stats.favorable3||actual.maximumUsage-actual.minimumUsage>1)throw new Error('조합 설계 검증 실패: '+m);
  for(const k of [4,5,6])if(actual.probabilities[k].favorable!==entry.stats['favorable'+k])throw new Error('당첨 영역 검증 실패: '+m);
}
const split=require('../data/split-risk.json');
if(split.sourceRounds.last!==data.metadata.lastRound||split.sourceRounds.count!==data.draws.length||!split.validation.improves)throw new Error('분할 위험 모형이 추첨 자료와 맞지 않습니다. node scripts/analyze-split-risk.cjs를 다시 실행하세요.');
// 연구용 자료 이후의 공식 회차(자동 갱신분)는 앱의 대조 기능에만 합친다. 분석 모형과 해시 고정 자료는 그대로다.
const recent=require('./recent-draws.cjs');
const merged=[...data.draws,...recent.validate(data.draws,recent.load())];
const compact={metadata:{...data.metadata,lastRound:merged.at(-1).round,lastDrawDate:merged.at(-1).date},draws:merged.map(({round,date,numbers,bonus})=>({round,date,numbers,bonus}))};
fs.writeFileSync(path.join(dist,'draws.js'),[['LOTTO_DATA',compact],['LOTTO_PORTFOLIO',templates],['LOTTO_SPLIT',split]].map(([name,value])=>'window.'+name+' = '+JSON.stringify(value).replace(/</g,'\\u003c')+';').join('\n'));
let html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const css=fs.readFileSync(path.join(dist,'styles.css'),'utf8');
html=html.replace('<link rel="stylesheet" href="styles.css">',()=>'<style>\n'+css+'\n</style>');
new vm.Script(fs.readFileSync(path.join(dist,'sw.js'),'utf8'),{filename:'sw.js'});
for(const name of ['core.js','portfolio.js','split.js','round.js','draws.js','app.js']){
  const code=fs.readFileSync(path.join(dist,name),'utf8');
  new vm.Script(code,{filename:name});
  // Preserve defer ordering in a single offline file by moving scripts below the body content.
  html=html.replace(`<script defer src="${name}"></script>`,'');
  html=html.replace('</body>',()=>`<script>\n${code.replace(/<\/script/gi,'<\\/script')}\n</script>\n</body>`);
}
for(const match of fs.readFileSync(path.join(dist,'index.html'),'utf8').matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(!/^https?:/.test(match[1]) && !fs.existsSync(path.join(dist,match[1]))) throw new Error('Missing local asset: '+match[1]);
}
const output=path.join(root,'로또번호 생성기.html');
fs.writeFileSync(output,html);
// GitHub Pages(main 브랜치 /docs)용 배포본: 같은 단일 HTML과 홈 화면 아이콘.
const pages=path.join(root,'docs');
fs.mkdirSync(pages,{recursive:true});
fs.writeFileSync(path.join(pages,'index.html'),html);
for(const name of ['manifest.webmanifest','icon.svg','sw.js'])fs.copyFileSync(path.join(dist,name),path.join(pages,name));
fs.writeFileSync(path.join(pages,'.nojekyll'),'');
require('./build-portfolio-report.cjs');
require('./build-jackpot-report.cjs');
console.log(`완료: ${output} (${Math.round(fs.statSync(output).size/1024)} KB), 과거 기록 ${merged.length}회`);
