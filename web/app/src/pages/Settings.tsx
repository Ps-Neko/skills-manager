import { Link } from 'react-router-dom';
import { useScan, useStatus } from '../lib/queries';
import { SkeletonRows, ErrorState, Panel } from '../components/ui';
export default function Settings() {
  const scan = useScan(); const status = useStatus();
  if (scan.isLoading) return <Panel><SkeletonRows rows={6} /></Panel>;
  if (scan.isError) return <ErrorState error={scan.error} />;
  const s = scan.data!.summary;
  const rows: [string, string][] = [
    ['버전', s.version || '—'],
    ['스킬 폴더 경로', s.skillsPath || '—'],
    ['CLI 연결', status.data?.cliConnected ? '연결됨' : '미연결'],
    ['데이터 출처', status.data?.fixture ? '스냅샷(fixture)' : '라이브 스캔'],
    ['총 스킬 수', String(s.totalSkills)],
    ['출처 수', String(s.sources)],
    ['중복 묶어 정리한 건수', String(s.mirrorsFolded)],
    ['동작 원칙', '읽기 전용 — 검사만, 아무것도 바꾸지 않음'],
  ];
  return (
    <>
      <Link className="back" to="/">← 대시보드</Link>
      <div className="page-head"><div><h1>설정 · 환경</h1><p className="sub">이 콘솔이 무엇을·어디서 읽는지. 설정 변경은 없습니다(읽기 전용).</p></div></div>
      <div className="kv">{rows.map(([k, v]) => <div className="kv-row" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>
    </>
  );
}
