import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useScan, useStatus, useRescan } from '../lib/queries';
import { Panel, SkeletonRows, ErrorState } from '../components/ui';
import { DuplicateTable } from '../components/DuplicateTable';
import type { ScanDTO, StatusDTO, SummaryDTO } from '../lib/types';

// 카드가 읽는 키는 SummaryDTO의 숫자 지표로만 제약한다(강제 캐스팅 제거).
type StatKey = { [K in keyof SummaryDTO]: SummaryDTO[K] extends number ? K : never }[keyof SummaryDTO];

// 지표마다 뜻이 통하는 아이콘: 총 스킬=묶음/블록, 겹치는 일=겹친 원, 출처=폴더, 플러그인=퍼즐 조각.
// 타일 색은 의미를 인코딩하지 않아 중성으로 통일(One Guide Rule) — 아이콘 모양이 지표를 구분한다.
const tiles: { key: StatKey; label: string; unit: string; sub: string; icon: ReactNode }[] = [
  { key: 'totalSkills', label: '총 스킬', unit: '개', sub: '정리된 고유 스킬',
    icon: <><rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.7" /><rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.7" /><rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.7" /><rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.7" /></> },
  { key: 'duplicateGroups', label: '겹치는 일', unit: '묶음', sub: '같은 일을 하는 묶음',
    icon: <><circle cx="9" cy="12" r="6" stroke="currentColor" strokeWidth="1.7" /><circle cx="15" cy="12" r="6" stroke="currentColor" strokeWidth="1.7" /></> },
  { key: 'sources', label: '출처', unit: '곳', sub: '스킬을 가져온 곳',
    icon: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /> },
  { key: 'activePlugins', label: '플러그인', unit: '개', sub: '설치된 플러그인',
    icon: <path d="M9 3h3a1 1 0 0 1 1 1v1.5a1.5 1.5 0 0 0 3 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.5a1.5 1.5 0 0 0 0 3H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-1.5a1.5 1.5 0 0 0-3 0V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-3" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /> },
];

function Onboarding({ status, disconnected }: { status?: StatusDTO; disconnected?: boolean }) {
  const m = useRescan();
  return (
    <div className="onboard">
      <span className="ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M12 11v4m0-7h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></span>
      <h2>{disconnected ? '스킬 폴더를 찾지 못했어요' : '아직 정리할 스킬이 없어요'}</h2>
      <p>{disconnected
        ? (status?.reason || 'Claude Code 스킬 폴더(~/.claude/skills)를 찾지 못했어요. 설치돼 있는지, 경로가 맞는지 확인해 주세요.')
        : '스킬 폴더는 찾았어요 — 아직 설치된 스킬이 0개예요. 아무것도 사라지거나 바뀌지 않았어요.'}</p>
      {status?.summary?.skillsPath && <span className="path">{status.summary.skillsPath}</span>}
      <p>Claude Code 스킬을 설치한 뒤 다시 스캔하면 여기 채워집니다.</p>
      <button className="btn primary" onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? '스캔 중…' : '다시 스캔'}</button>
    </div>
  );
}

// 출처 분포: 색점은 장식(aria-hidden)이고, 같은 정보를 스크린리더용 텍스트로 한 줄 요약한다.
function SourceBreakdown({ dist }: { dist: SummaryDTO['sourceDistribution'] }) {
  const summary = dist.map((d) => `${d.source} ${d.count}개`).join(', ');
  return (
    <span className="sub src-summary" role="img" aria-label={`출처별 분포 — ${summary}`}>
      <span aria-hidden>{dist.map((d) => d.source).join(' · ')}</span>
    </span>
  );
}

function Body({ scan, status }: { scan: ScanDTO; status?: StatusDTO }) {
  const s = scan.summary;
  const when = status?.lastScannedAt ? new Date(status.lastScannedAt).toLocaleString('ko-KR') : '방금';
  const log = [
    `node scan.js --json            → 스킬 ${s.totalSkills} · 겹침묶음 ${s.totalGroups} · 출처 ${s.sources}`,
    `node scan.js --workflows --json → 워크플로우 해소`,
    `node manage-scan.js --update-status → 단독·플러그인 상태`,
  ];
  return (
    <>
      <div className="stat-grid">
        {tiles.map((t) => (
          <div className="stat-card" key={t.key}>
            <span className="tile">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>{t.icon}</svg>
            </span>
            <span className="lbl">{t.label}</span>
            <span className="num mono">{s[t.key]}<span className="u">{t.unit}</span></span>
            {t.key === 'sources' && s.sourceDistribution.length > 0
              ? <SourceBreakdown dist={s.sourceDistribution} />
              : <span className="sub">{t.sub}</span>}
          </div>
        ))}
      </div>
      <div className="grid-2">
        <Panel title="중복 분석 요약" note="우선 검토가 필요한 묶음" link={<Link to="/duplicates">전체 보기 →</Link>}>
          <DuplicateTable rows={scan.duplicates} limit={6} />
        </Panel>
        <Panel title="CLI 실행" note={status?.fixture ? '데모(fixture)' : '로컬'}>
          <div className="cli-meta">마지막 스캔 · {when}</div>
          <div className="note-box"><span className="ic" aria-hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" /></svg></span><span>웹은 명령을 직접 받지 않아요. <b>허용된 action</b>만 서버가 골라 실행합니다(읽기 전용).</span></div>
          <details className="cli-details">
            <summary>개발자용 상세 — 실행된 명령 보기</summary>
            <pre className="cli-log">{log.join('\n')}</pre>
          </details>
        </Panel>
      </div>
    </>
  );
}
export default function Dashboard() {
  const scan = useScan(); const status = useStatus();
  const disconnected = status.data && !status.data.cliConnected;
  const empty = scan.data && scan.data.summary.totalSkills === 0;
  return (
    <>
      <div className="page-head">
        <div><h1>스킬 현황 <em>한눈에</em></h1><p className="sub">로컬 CLI가 읽은 ~/.claude/skills 결과예요.</p></div>
        <Link className="btn primary" to="/recommend">추천 받기 →</Link>
      </div>
      {scan.isLoading ? <Panel title="불러오는 중"><SkeletonRows rows={6} /></Panel>
        : scan.isError ? <ErrorState error={scan.error} hint="스캔을 불러오지 못했어요." />
        : (disconnected || empty) ? <Onboarding status={status.data} disconnected={!!disconnected} />
        : <Body scan={scan.data!} status={status.data} />}
    </>
  );
}
