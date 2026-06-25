import { Link } from 'react-router-dom';
import { useWorkflows } from '../lib/queries';
import { SkeletonRows, ErrorState, Panel, CopyCmd } from '../components/ui';
import type { WorkflowStep } from '../lib/types';
function Pill({ s }: { s: WorkflowStep }) {
  if (s.kind === 'pinned') return <span className="step-pill multi">고정 <span className="mono" style={{ fontSize: 12 }}>{s.skills[0]}</span></span>;
  if (s.kind === 'none') return <span className="step-pill" style={{ fontStyle: 'italic', color: 'var(--ink-faint)' }}>기본 Claude로</span>;
  if (s.count === 1) return <span className="step-pill">1곳 — {s.sources[0]}</span>;
  return <span className="step-pill multi">{s.count}곳 겹침 — 추천에서 하나로</span>;
}
export default function Workflows() {
  const wf = useWorkflows();
  return (
    <>
      <Link className="back" to="/">← 대시보드</Link>
      <div className="page-head"><div><h1>내 워크플로우</h1><p className="sub">단계마다 쓸 스킬을 미리 정해둔 순서예요.</p></div></div>
      {wf.isLoading ? <Panel><SkeletonRows rows={6} /></Panel>
        : wf.isError ? <ErrorState error={wf.error} hint="워크플로우를 불러오지 못했어요." />
        : <>
            {wf.data!.workflows.map((w) => (
              <div className="wf-card" key={w.name}>
                <div className="wf-h"><span className="wl">{w.label}</span><span className="wn">{w.name}</span><span className={`tag${w.source === 'user' ? ' mine' : ''}`}>{w.source === 'user' ? '내 것' : '내장'}</span></div>
                {w.steps.map((s, i) => (
                  <div className="step-row" key={i}><span className="sn">{i + 1}</span><span className="sl">{s.label}{s.note && <small>{s.note}</small>}</span><Pill s={s} /></div>
                ))}
              </div>
            ))}
            <Panel title="내 흐름 새로 만들기 · 고치기">
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 8px' }}>저장·수정은 명령으로 안전하게:</p>
              <CopyCmd cmd="node scan.js --save <이름>" />
              <CopyCmd cmd="node scan.js --set-skill <이름> --step <번호> --skill <스킬id>" />
            </Panel>
          </>}
    </>
  );
}
