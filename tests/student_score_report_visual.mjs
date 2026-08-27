import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const dependencyRoot = 'C:/Users/kkson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(pathToFileURL(`${dependencyRoot}/package.json`));
const { chromium } = require('playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, value => value.slice(1)));
const outputRoot = path.resolve(root, '..', '..', 'outputs');
const payload = {
  success:true,
  published:true,
  sourceOfTruth:'ScoreReportHistory.PUBLISHED',
  student:{studentId:'SAMPLE',name:'가상학생',className:'중3A',course:'중',grade:'3'},
  publication:{reportId:'SRH_SAMPLE',periodStart:'2025-09-01',periodEnd:'2026-07-31',publishedAt:'2026-08-28T10:00:00+09:00',cacheSeconds:120},
  report:{
    template:'COREDB-SCORE-FINAL-V953-HEADER-AXIS',
    student:{id:'SAMPLE',name:'가상학생'},periodStart:'2025-09-01',periodEnd:'2026-07-31',
    entries:[
      {date:'2025-10-15',year:2025,semester:'2',examType:'중간',name:'2학기 중간',score:74,schoolAverage:68,gradeLevel:'4',schoolName:'샘플중',grade:'3',className:'중3A',subject:'영어',scope:'교과서 3~4과',classRank:{rank:4,count:12},schoolRank:{rank:7,count:20}},
      {date:'2025-12-12',year:2025,semester:'2',examType:'기말',name:'2학기 기말',score:82,schoolAverage:71,gradeLevel:'3',schoolName:'샘플중',grade:'3',className:'중3A',subject:'영어',scope:'교과서 5~7과',classRank:{rank:3,count:12},schoolRank:{rank:5,count:20}},
      {date:'2026-04-23',year:2026,semester:'1',examType:'중간',name:'1학기 중간',score:88,schoolAverage:73,gradeLevel:'2',schoolName:'샘플고',grade:'1',className:'고1A',subject:'영어',scope:'교과서 1~3과',classRank:{rank:2,count:11},schoolRank:{rank:4,count:18}},
      {date:'2026-07-03',year:2026,semester:'1',examType:'기말',name:'1학기 기말',score:91,schoolAverage:76,gradeLevel:'2',schoolName:'샘플고',grade:'1',className:'고1A',subject:'영어',scope:'교과서 4~6과',classRank:{rank:1,count:11},schoolRank:{rank:3,count:18}}
    ],
    stats:{count:4,average:83.8,min:74,max:91},averageGap:11.8,latest:{score:91,schoolAverage:76,gradeLevel:'2'},latestDelta:3,
    forecast:{lower:84,upper:96,target:94,evidence:'근거 보통',stability:'변동 낮음',action:'이번 상승에 기여한 학습 루틴 1가지를 다음 시험까지 반복해 보세요.'},
    judgement:'학교평균 이상 유지',classRank:{rank:1,count:11},schoolRank:{rank:3,count:18},meta:{schoolName:'샘플고',grade:'1',className:'고1A',subject:'영어'}
  }
};

const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
  const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href, {waitUntil:'domcontentloaded'});
  await page.evaluate(data => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('loader').classList.add('hidden');
    currentUser = {id:'SAMPLE',name:'가상학생',token:'TEST'};
    myScoreReportLoadedOnce = true;
    showTab('report', {skipHistory:true,keepScroll:true});
    renderMyScoreReport(data);
  }, payload);
  const metrics = await page.evaluate(() => ({
    bodyWidth:document.body.scrollWidth,
    viewport:window.innerWidth,
    metricColumns:getComputedStyle(document.querySelector('.score-report-grid')).gridTemplateColumns.split(' ').length,
    reportVisible:getComputedStyle(document.getElementById('report')).display !== 'none',
    rawDriveLinks:[...document.querySelectorAll('#school-report-view a')].some(link => /drive\.google\.com/.test(link.href))
  }));
  assert.equal(metrics.reportVisible, true);
  assert.ok(metrics.bodyWidth <= metrics.viewport + 1, `mobile body overflow: ${metrics.bodyWidth} > ${metrics.viewport}`);
  assert.equal(metrics.metricColumns, 2);
  assert.equal(metrics.rawDriveLinks, false);
  await page.screenshot({path:path.join(outputRoot,'student-score-report-mobile-20260828.png'),fullPage:true});

  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:path.join(outputRoot,'student-score-report-desktop-20260828.png'),fullPage:true});
  console.log(JSON.stringify({ok:true,metrics}, null, 2));
} finally {
  await browser.close();
}
