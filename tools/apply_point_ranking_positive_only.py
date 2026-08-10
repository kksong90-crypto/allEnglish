from pathlib import Path
p=Path(__file__).resolve().parents[1]/'index.html'
s=p.read_text(encoding='utf-8').replace('\r\n','\n')
def once(old,new,label):
    global s
    n=s.count(old)
    if n!=1: raise RuntimeError(f'{label}: expected 1 match, found {n}')
    s=s.replace(old,new,1)
once('<meta name="allbarun-student-version" content="6.6.0-VOCA-STATION-ROLE-SAFE" />','<meta name="allbarun-student-version" content="6.6.1-POINT-RANK-POSITIVE-ONLY" />','version')
once('pointRankingPayload.currentTop10 = json.currentTop10 || [];','pointRankingPayload.currentTop10 = (json.currentTop10 || []).filter(item => Number(item.currentPoint || 0) > 0);','current load filter')
once('pointRankingPayload.totalTop10 = json.totalTop10 || [];','pointRankingPayload.totalTop10 = (json.totalTop10 || []).filter(item => Number(item.totalPoint || 0) > 0);','total load filter')
old='''const data = isCurrentMode
    ? pointRankingPayload.currentTop10
    : pointRankingPayload.totalTop10;'''
new='''const data = (isCurrentMode
    ? pointRankingPayload.currentTop10
    : pointRankingPayload.totalTop10
  ).filter(item => Number(isCurrentMode ? item.currentPoint : item.totalPoint) > 0);'''
once(old,new,'render defensive filter')
# Make the empty state explain that zero-point students are intentionally excluded.
old_empty='''box.innerHTML = `<div class="rank-empty">랭킹 데이터가 없습니다.</div>`;'''
if old_empty in s:
    s=s.replace(old_empty,'box.innerHTML = `<div class="rank-empty">아직 1P 이상 보유·누적한 랭킹 대상 학생이 없습니다.</div>`;',1)
else:
    marker='''if (!data || data.length === 0) {'''
    pos=s.find(marker)
    if pos<0: raise RuntimeError('ranking empty-state marker not found')
    # Existing message remains valid only if it already explains the positive-only rule.
    tail=s[pos:pos+700]
    if not ('1P 이상' in tail or '포인트가 있는 학생' in tail or '랭킹 대상' in tail):
        raise RuntimeError('ranking empty-state text requires manual review')
p.write_text(s,encoding='utf-8',newline='\n')
print('applied positive-only point ranking guard')
