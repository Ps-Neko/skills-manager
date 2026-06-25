import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRecommend } from '../lib/queries';
import { Panel, SkeletonRows, ErrorState, SrcChip } from '../components/ui';
export default function Recommend() {
  const { cap } = useParams();
  const rec = useRecommend();
  const [q, setQ] = useState('');
  // 입력값(q)은 즉시 반영하되, 필터에 쓰는 검색어(dq)는 130ms 디바운스해 타이핑마다 전체 재계산하지 않는다.
  const [dq, setDq] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 130);
    return () => clearTimeout(t);
  }, [q]);
  // 검색어·추천 결과가 그대로면 목록 필터를 다시 돌리지 않게 메모이즈한다.
  const list = useMemo(() => {
    const term = dq.toLowerCase();
    return (rec.data?.items ?? []).filter((g) => !term || g.label.toLowerCase().includes(term) || g.capability.includes(term));
  }, [rec.data, dq]);
  if (rec.isLoading) return <Panel><SkeletonRows rows={6} /></Panel>;
  if (rec.isError) return <ErrorState error={rec.error} hint="추천을 불러오지 못했어요." />;
  const items = rec.data!.items;
  if (cap) {
    const g = items.find((x) => x.capability === cap);
    if (!g) return <ErrorState error={new Error('not found')} hint="그 작업을 못 찾았어요." />;
    return (
      <>
        <Link className="back" to="/recommend">← 작업 고르기</Link>
        <div className="page-head"><div><h1>{g.label}</h1><p className="sub">{g.count}곳에서 이 일을 할 수 있어요.</p></div></div>
        {g.recommended && (
          <div className="panel" style={{ background: 'var(--accent-soft)', borderColor: '#cfe0fd' }}>
            <div className="panel-body">
              <span className="badge on" style={{ marginBottom: 10, display: 'inline-block' }}>추천 · 이거 하나면 충분</span>
              <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{g.recommended.id}</div>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '9px 0 0' }}>{g.recommended.why}</p>
            </div>
          </div>
        )}
        <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 700, margin: '20px 0 9px' }}>나머지 후보 — 이 흐름선 불필요</p>
        <Panel>
          {g.alternatives.length ? g.alternatives.map((a) => (
            <div className="skill-line" key={a.id}><span className="id">{a.id}</span><span className="src">{a.source}</span></div>
          )) : <div className="state">다른 후보 없음 — 이 하나뿐이에요.</div>}
        </Panel>
      </>
    );
  }
  return (
    <>
      <Link className="back" to="/">← 대시보드</Link>
      <div className="page-head"><div><h1>이 작업 뭐 쓰지</h1><p className="sub">작업을 고르면 하나면 충분한 추천과 후보를 보여드려요.</p></div></div>
      <div className="search" style={{ maxWidth: '100%', marginBottom: 18 }}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 테스트, 리뷰, 디버깅…" />
      </div>
      <div className="cap-grid">
        {list.map((g) => (
          <Link key={g.id} className={`cap-card${g.solo ? ' solo' : ''}`} to={`/recommend/${encodeURIComponent(g.capability)}`}>
            <span className="cl">{g.label}</span>
            <span className="cn">{g.solo ? '겹침 없음 · 1곳' : `${g.count}곳에서 겹침`}</span>
            <span style={{ marginTop: 'auto' }}>{g.sources.map((s) => <SrcChip key={s} source={s} />)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
