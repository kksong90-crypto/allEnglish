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
once('box.innerHTML = `<p class="empty-message">아직 포인트 랭킹이 없습니다.</p>`;','box.innerHTML = `<p class="empty-message">아직 1P 이상 보유·누적한 랭킹 대상 학생이 없습니다.</p>`;','positive-only empty state')
p.write_text(s,encoding='utf-8',newline='\n')
print('applied positive-only point ranking guard')
