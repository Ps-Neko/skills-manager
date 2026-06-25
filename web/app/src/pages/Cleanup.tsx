import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAudit, useManage } from '../lib/queries';
import { api } from '../lib/api';
import { Panel, SkeletonRows, ErrorState } from '../components/ui';
import type { RemovePreview } from '../lib/types';

type Phase = 'report' | 'running' | 'done' | 'failed';
type Res = { name: string; ok: boolean; error?: string };
// 서버가 ok:false 로 돌려주는 안전 중단 응답(휴지통 이동 실패·토큰 불일치 등). HTTP 200 으로 와서 throw 되지 않는다.
type RemoveResult = RemovePreview & { reason?: string; hint?: string; error?: string };
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// 미리보기~확인 사이 폴더가 바뀌면 서버가 토큰을 안전상 거부한다 — 이때만 '대상 변경'으로 본다.
const TARGET_CHANGED = new Set(['token-mismatch', 'not-standalone', 'resolve-failed', 'outside-skills']);
class TargetChangedError extends Error {}

// 상태별 그룹 정의 (단독 설치 스킬을 업데이트 경로 기준으로 묶는다).
type Kind = 'git' | 'copy' | 'unknown';
const GROUP_META: { kind: Kind; label: string; hint: string }[] = [
  { kind: 'git', label: '업데이트 가능 (git)', hint: 'git 복제본 — git pull 로 갱신할 수 있어요.' },
  { kind: 'copy', label: '경로 없음 (복사본)', hint: '복사본 — 자동 업데이트 경로가 없어요.' },
  { kind: 'unknown', label: '기타', hint: '설치 형태를 확인하지 못했어요.' },
];
const COLLAPSE_AT = 12; // 이보다 많으면 기본 접고 '더보기'로 펼침

function Head() {
  return (
    <>
      <Link className="back" to="/">← 대시보드</Link>
      <div className="page-head"><div><h1>정리 리포트</h1><p className="sub">겹치는 묶음마다 <b>하나만 남기고</b> 나머지 단독 중복을 골라, 한 번에 <b>되돌릴 수 있는 휴지통</b>으로 옮겨요.</p></div></div>
    </>
  );
}

export default function Cleanup() {
  const audit = useAudit();
  const manage = useManage();
  const qc = useQueryClient();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>('report');
  const [prog, setProg] = useState({ done: 0, total: 0, current: '' });
  const [results, setResults] = useState<Res[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<Kind>>(new Set());
  const [notice, setNotice] = useState('');

  // 단독 정리 후보 한 곳에 모으기(이름 중복 제거) + 업데이트 상태(kind) 라벨 부여.
  const candidates = useMemo(() => {
    if (!audit.data) return [];
    const kindOf = new Map<string, Kind>();
    for (const s of manage.data?.standalone ?? []) kindOf.set(s.name, s.kind === 'git' ? 'git' : 'copy');
    const seen = new Set<string>();
    const list: { name: string; id: string; source: string; capability: string; kind: Kind }[] = [];
    for (const g of audit.data.groups) {
      for (const r of g.removable) {
        if (seen.has(r.name)) continue;
        seen.add(r.name);
        list.push({ name: r.name, id: r.id, source: r.source, capability: g.label, kind: kindOf.get(r.name) ?? 'unknown' });
      }
    }
    return list;
  }, [audit.data, manage.data]);

  if (audit.isLoading) return <><Head /><Panel><SkeletonRows rows={8} /></Panel></>;
  if (audit.isError) return <><Head /><ErrorState error={audit.error} hint="정리 리포트를 불러오지 못했어요." /></>;
  const data = audit.data!;
  const allNames = candidates.map((c) => c.name);
  const toggle = (n: string) => setSel((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const toggleExpand = (k: Kind) => setExpanded((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });

  // 이름 검색 필터(대소문자 무시) → 상태별 그룹으로 묶기.
  const q = query.trim().toLowerCase();
  const filtered = q ? candidates.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) : candidates;
  const grouped = GROUP_META
    .map((m) => ({ ...m, rows: filtered.filter((c) => c.kind === m.kind) }))
    .filter((g) => g.rows.length > 0);

  async function run() {
    const names = [...sel];
    setNotice('');
    setPhase('running'); setProg({ done: 0, total: names.length, current: '' });
    const out: Res[] = [];
    try {
      for (const name of names) {
        setProg((p) => ({ ...p, current: name }));
        try {
          const pv = await api.removePreview(name);
          if (!pv.confirmToken) throw new Error('확인 토큰을 받지 못했어요.');
          const cf: RemoveResult = await api.removeConfirm(name, pv.confirmToken);
          // 서버가 안전상 중단(ok:false): 미리보기~확인 사이 폴더가 바뀐 경우는 전체를 멈추고 미리보기로 되돌린다.
          if (cf.ok === false) {
            if (cf.reason && TARGET_CHANGED.has(cf.reason)) throw new TargetChangedError();
            out.push({ name, ok: false, error: cf.hint || cf.reason || cf.error || '휴지통으로 옮기지 못했어요.' });
          } else {
            out.push({ name, ok: true });
          }
        } catch (e) {
          if (e instanceof TargetChangedError) throw e; // 바깥으로 던져 전체 중단
          out.push({ name, ok: false, error: errMsg(e) });
        }
        setProg((p) => ({ ...p, done: p.done + 1 }));
      }
    } catch (e) {
      if (e instanceof TargetChangedError) {
        // 대상이 바뀜 → 확인 전(미리보기) 단계로 자동 복귀하고 안내. 이미 옮긴 건은 캐시 갱신으로 반영.
        setResults([]);
        setPhase('report');
        setNotice('대상이 바뀌어 안전을 위해 중단했어요 — 미리보기를 다시 띄워(아래에서 다시 선택해) 확인하세요. 이미 옮긴 항목이 있으면 목록에서 빠집니다.');
        qc.invalidateQueries({ queryKey: ['manage'] }); qc.invalidateQueries({ queryKey: ['scan'] }); qc.invalidateQueries({ queryKey: ['status'] }); qc.invalidateQueries({ queryKey: ['audit'] });
        audit.refetch(); manage.refetch();
        return;
      }
      throw e;
    }
    setResults(out); setPhase(out.every((r) => r.ok) ? 'done' : 'failed');
    // 제거 후 영향받는 화면만 갱신(서버 캐시는 remove-confirm에서 비움).
    qc.invalidateQueries({ queryKey: ['manage'] }); qc.invalidateQueries({ queryKey: ['scan'] }); qc.invalidateQueries({ queryKey: ['status'] });
  }
  const reset = () => { setPhase('report'); setSel(new Set()); setResults([]); setNotice(''); audit.refetch(); manage.refetch(); };

  if (phase === 'running') {
    return (<><Head /><Panel title="휴지통으로 옮기는 중">
      <div className="prog"><i style={{ transform: `scaleX(${prog.total ? prog.done / prog.total : 0})` }} /></div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{prog.done} / {prog.total} · 지금: <span className="mono">{prog.current}</span></p>
    </Panel></>);
  }
  if (phase === 'done' || phase === 'failed') {
    const ok = results.filter((r) => r.ok).length; const bad = results.filter((r) => !r.ok);
    return (<><Head /><Panel title={phase === 'done' ? '정리 완료' : '일부만 정리됨'}>
      <div className="audit-sum" style={{ margin: 0, marginBottom: 12 }}>
        <div><div className="big">{data.summary.totalSkills}</div><div className="cap">정리 전</div></div>
        <span className="arrow">→</span>
        <div><div className="big after">{data.summary.totalSkills - ok}</div><div className="cap">정리 후</div></div>
        <div className="spacer" /><div className="note"><b style={{ color: 'var(--ink)' }}>{ok}개</b>를 되돌릴 수 있는 휴지통으로 옮겼어요. 잘못 옮겼으면 휴지통에서 복원하면 됩니다.</div>
      </div>
      {bad.length > 0 && <div className="note-box warn" style={{ marginTop: 0 }}>{bad.length}개는 옮기지 못했어요: {bad.map((b) => b.name).join(', ')}</div>}
      <button className="btn primary" onClick={reset} style={{ marginTop: 14 }}>다시 점검</button>
    </Panel></>);
  }

  // phase === 'report'
  return (
    <>
      <Head />
      <div className="audit-sum">
        <div><div className="big">{data.summary.totalSkills}</div><div className="cap">지금 스킬</div></div>
        <span className="arrow">→</span>
        <div><div className="big after">~{data.summary.afterCount}</div><div className="cap">전부 정리 시</div></div>
        <div className="spacer" />
        <div className="note">{data.note}</div>
      </div>

      {notice && <div className="note-box warn">{notice}</div>}

      {candidates.length === 0
        ? <Panel><div className="state"><h3>정리할 단독 스킬이 없어요</h3><p style={{ fontSize: 13 }}>겹치는 후보가 대부분 플러그인 안에 있어요. 플러그인은 <span className="mono">/plugin uninstall</span> 로 통째 제거합니다.</p></div></Panel>
        : (
          <>
            <div className="search" style={{ maxWidth: 'none', marginBottom: 14 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`단독 정리 후보 ${candidates.length}개 중 이름으로 찾기…`} aria-label="스킬 이름 검색" />
              {query && <button className="linkbtn" onClick={() => setQuery('')}>지우기</button>}
            </div>

            {grouped.length === 0
              ? <Panel><div className="state"><h3>'{query}'에 맞는 스킬이 없어요</h3><p style={{ fontSize: 13 }}>이름 일부만 입력해 보세요.</p></div></Panel>
              : grouped.map((g) => {
                const open = !!q || expanded.has(g.kind) || g.rows.length <= COLLAPSE_AT;
                const shown = open ? g.rows : g.rows.slice(0, COLLAPSE_AT);
                const selInGroup = g.rows.filter((r) => sel.has(r.name)).length;
                return (
                  <div className="ag-card" key={g.kind}>
                    <div className="ag-head">
                      <span className="l">{g.label}</span>
                      <span className="rec-txt">{g.hint}</span>
                      <span className="c">{selInGroup ? `${selInGroup}/${g.rows.length}곳 선택` : `${g.rows.length}곳`}</span>
                    </div>
                    {shown.map((r) => (
                      <label className="rm-row" key={r.id}>
                        <input type="checkbox" checked={sel.has(r.name)} onChange={() => toggle(r.name)} />
                        <span className="id">{r.id}</span>
                        <span className="meta">{r.capability} · 단독 · 정리 가능</span>
                      </label>
                    ))}
                    {!open && (
                      <button className="linkbtn" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 18px', borderTop: '1px solid var(--line-soft)' }} onClick={() => toggleExpand(g.kind)}>
                        + 나머지 {g.rows.length - COLLAPSE_AT}개 더보기
                      </button>
                    )}
                    {open && !q && g.rows.length > COLLAPSE_AT && (
                      <button className="linkbtn" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 18px', borderTop: '1px solid var(--line-soft)' }} onClick={() => toggleExpand(g.kind)}>
                        접기
                      </button>
                    )}
                  </div>
                );
              })}

            {/* 묶음별 권장(유지 권장·플러그인 묶임) — 어떤 걸 남기고 무엇은 개별 삭제가 안 되는지 맥락 보존. */}
            {data.groups.some((g) => g.keep || g.pluginBound.length > 0) && (
              <details className="ag-card" style={{ padding: 0 }}>
                <summary className="ag-head" style={{ cursor: 'pointer', listStyle: 'revert' }}>
                  <span className="l">묶음별 권장 보기</span>
                  <span className="c">유지 권장 · 플러그인 묶임</span>
                </summary>
                {data.groups.map((g) => (
                  ((g.keep || g.pluginBound.length > 0) && (
                    <div key={g.capability}>
                      {g.keep && <div className="ag-keep"><span className="tag">유지 권장</span><span className="id">{g.keep.id}</span><span className="why">{g.label} · {g.keep.why}</span></div>}
                      {g.pluginBound.map((p) => (
                        <div className="pb-row" key={p.id}><span className="id">{p.id}</span><span className="tag">플러그인 — 개별 삭제 불가</span></div>
                      ))}
                    </div>
                  ))
                ))}
              </details>
            )}
          </>
        )}

      {candidates.length > 0 && (
        <div className="actionbar">
          <span className="sel">{sel.size}개 선택</span>
          <div className="links">
            <button onClick={() => setSel(new Set(allNames))}>전체 선택</button>
            <button onClick={() => setSel(new Set())}>해제</button>
          </div>
          <div className="grow" />
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>되돌릴 수 있는 휴지통으로</span>
          <button className="btn primary" disabled={sel.size === 0} onClick={run}>선택한 {sel.size}개 정리하기</button>
        </div>
      )}
    </>
  );
}
