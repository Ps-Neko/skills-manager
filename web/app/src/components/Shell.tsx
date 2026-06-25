import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useStatus, useRescan } from '../lib/queries';

const nav = [
  { to: '/', end: true, label: '대시보드', icon: <path d="M4 13h7V4H4v9Z" fill="currentColor" /> },
  { to: '/duplicates', label: '중복 분석', icon: <><circle cx="9" cy="12" r="6" stroke="currentColor" strokeWidth="1.7" /><circle cx="15" cy="12" r="6" stroke="currentColor" strokeWidth="1.7" /></> },
  { to: '/recommend', label: '추천', icon: <path d="m12 3 2.6 5.7 6.4.6-4.8 4.3 1.4 6.4L12 17l-5.6 3 1.4-6.4L3 9.3l6.4-.6Z" stroke="currentColor" strokeWidth="1.6" /> },
  { to: '/workflows', label: '워크플로우', icon: <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.7" /> },
  { to: '/cleanup', label: '스킬 정리', icon: <path d="M12 3l7 3v5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3Z" stroke="currentColor" strokeWidth="1.6" /> },
  { to: '/settings', label: '설정', icon: <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" /> },
];

function RescanButton() {
  const m = useRescan();
  return (
    <button className="btn rescan-btn" onClick={() => m.mutate()} disabled={m.isPending} title="CLI로 다시 스캔">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden className={m.isPending ? 'spin' : ''}><path d="M20 11a8 8 0 1 0-.6 4M20 4v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="rescan-label">{m.isPending ? '스캔 중…' : '다시 스캔'}</span>
    </button>
  );
}
function CliBadge() {
  const { data, isLoading } = useStatus();
  const ok = !!data?.cliConnected;
  const when = data?.lastScannedAt ? new Date(data.lastScannedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <span className={`cli-badge ${ok ? 'ok' : 'off'}`} title={data?.reason || '로컬 CLI 연결 상태'}>
      <span className="d" />{isLoading ? 'CLI 확인 중…' : ok ? '로컬 CLI 연결됨' : 'CLI 미연결'}
      <span className="ro">· 검사는 읽기 전용</span><span style={{ color: 'var(--ink-faint)', fontWeight: 500 }}>· {when}</span>
    </span>
  );
}
export default function Shell() {
  const nv = useNavigate();
  const { data } = useStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <NavLink to="/" className="brand" onClick={closeMenu}><span className="logo">S</span><span><b>Skills Manager</b><small>로컬 CLI 콘솔</small></span></NavLink>
        <nav className="side-nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={closeMenu} className={({ isActive }) => (isActive ? 'active' : '')}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>{n.icon}</svg><span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="status-card">
            <div className="row"><span className={`dot ${data?.cliConnected ? 'on' : 'off'}`} /><span className="t">{data?.cliConnected ? 'CLI 연결됨' : 'CLI 미연결'}</span><span className="badge2">검사 읽기 전용</span></div>
            <div className="sub">~/.claude/skills를 이 PC에서만 읽어요(클라우드 전송 없음). 검사·추천은 읽기 전용, 스킬 정리(휴지통 이동)만 직접 확인 후 실행되는 되돌릴 수 있는 쓰기예요.</div>
          </div>
        </div>
      </aside>
      {menuOpen && <div className="nav-mask" onClick={closeMenu} aria-hidden />}
      <div className="main">
        <header className="topbar">
          <button type="button" className="nav-toggle" aria-label="메뉴 열기" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          <form className="search" onSubmit={(e) => { e.preventDefault(); const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value.trim(); nv('/duplicates' + (q ? `?q=${encodeURIComponent(q)}` : '')); }}>
            <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input name="q" placeholder="작업·스킬 검색 후 중복 분석으로…" autoComplete="off" />
          </form>
          <RescanButton />
          <CliBadge />
          <NavLink to="/settings" className="env-chip" title="이 PC에서만 읽는 읽기 전용 로컬 도구 · 설정 열기">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden><path d="M5 19V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
            <span className="env-text">읽기 전용 · 로컬</span>
          </NavLink>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
