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
// 연구용 자료 이후의 공식 회차(자동 갱신분)는 앱의 대조 기능에만 합친다. 분석 모형과 해시 고정 자료는 그대로다.
const recent=require('./recent-draws.cjs');
const merged=[...data.draws,...recent.validate(data.draws,recent.load())];
const compact={metadata:{
  schemaVersion:data.metadata.schemaVersion,game:data.metadata.game,timezone:data.metadata.timezone,
  sourceName:data.metadata.sourceName,sourceType:data.metadata.sourceType,
  sourcePageUrl:data.metadata.sourcePageUrl,sourceApiUrl:data.metadata.sourceApiUrl,
  firstRound:merged[0].round,lastRound:merged.at(-1).round,
  firstDrawDate:merged[0].date,lastDrawDate:merged.at(-1).date,
  drawCount:merged.length,expectedDrawCount:merged.at(-1).round-merged[0].round+1,
  completeStoredWindow:merged.every((draw,index)=>draw.round===merged[0].round+index),
  // The original retrieval date, requested period and validation describe only
  // the frozen source, not the subsequently merged app data.
  baseSourceMetadata:data.metadata
},draws:merged.map(({round,date,numbers,bonus})=>({round,date,numbers,bonus}))};
fs.writeFileSync(path.join(dist,'draws.js'),[['LOTTO_DATA',compact],['LOTTO_PORTFOLIO',templates]].map(([name,value])=>'window.'+name+' = '+JSON.stringify(value).replace(/</g,'\\u003c')+';').join('\n'));
const modules=['core.js','portfolio.js','coverage.js','extension.js','generation.js','round.js','draws.js','app.js','update.js'];
const workerSource=['core.js','portfolio.js','coverage.js','extension.js','generation.js'].map(name=>fs.readFileSync(path.join(dist,name),'utf8')).join('\n');
let html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const css=fs.readFileSync(path.join(dist,'styles.css'),'utf8');
const sw=fs.readFileSync(path.join(dist,'sw.js'),'utf8');
const release=require('node:crypto').createHash('sha256').update([html,css,sw,...modules.map(name=>fs.readFileSync(path.join(dist,name),'utf8'))].join('\n')).digest('hex').slice(0,16);
html=html.replaceAll('__LOTTO_RELEASE__',release);
html=html.replace('<link rel="stylesheet" href="styles.css">',()=>'<style>\n'+css+'\n</style>');
new vm.Script(fs.readFileSync(path.join(dist,'sw.js'),'utf8'),{filename:'sw.js'});
for(const name of modules){
  let code=fs.readFileSync(path.join(dist,name),'utf8');
  if(name==='generation.js')code+='\nwindow.LOTTO_WORKER_SOURCE='+JSON.stringify(workerSource).replace(/</g,'\\u003c')+';';
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
for(const name of ['manifest.webmanifest','icon.svg'])fs.copyFileSync(path.join(dist,name),path.join(pages,name));
fs.writeFileSync(path.join(pages,'sw.js'),sw.replaceAll('__LOTTO_RELEASE__',release));
fs.writeFileSync(path.join(pages,'version.json'),JSON.stringify({release,lastRound:compact.metadata.lastRound,lastDrawDate:compact.metadata.lastDrawDate})+'\n');
fs.writeFileSync(path.join(pages,'.nojekyll'),'');
require('./build-portfolio-report.cjs');
require('./build-jackpot-report.cjs');
console.log(`완료: ${output} (${Math.round(fs.statSync(output).size/1024)} KB), 과거 기록 ${merged.length}회`);
