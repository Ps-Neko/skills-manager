import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useScan } from '../lib/queries';
import { Panel, SkeletonRows, ErrorState, Drawer, SrcChip, EmptyState } from '../components/ui';
import { DuplicateTable } from '../components/DuplicateTable';
import type { DuplicateGroup } from '../lib/types';
export default function Duplicates() {
  const scan = useScan();
  const [sp] = useSearchParams();
  const rawQ = sp.get('q') || '';
  const q = rawQ.toLowerCase();
  const [sel, setSel] = useState<DuplicateGroup | null>(null);
  // 검색어·스캔 결과가 그대로면 화면 전환마다 필터를 다시 돌리지 않게 메모이즈한다.
  const rows = useMemo(
    () => (scan.data?.duplicates ?? []).filter((g) => !q || g.label.toLowerCase().includes(q) || g.skills.some((s) => s.id.toLowerCase().includes(q))),
    [scan.data, q],
  );
  return (
    <>
      <Link className="back" to="/">← 대시보드</Link>
      <div className="page-head"><div><h1>중복 분석</h1><p className="sub">같은 일을 하는 스킬이 몇 곳에 있는지 — 무엇부터 정리할지 판단하는 표예요. 곳수·중복도 순.</p></div></div>
      {scan.isLoading ? <Panel><SkeletonRows rows={8} /></Panel>
        : scan.isError ? <ErrorState error={scan.error} hint="중복 분석을 불러오지 못했어요." />
        : rows.length === 0
          ? <Panel><EmptyState title={rawQ ? `'${rawQ}'에 맞는 묶음이 없어요` : '겹치는 일이 없어요'}>{rawQ ? '다른 검색어로 찾거나 검색을 지우면 전체가 보여요.' : '같은 일을 하는 스킬이 여러 곳에 흩어져 있지 않다는 뜻 — 깔끔합니다. 끌 건 없어요.'}</EmptyState></Panel>
          : <Panel><DuplicateTable rows={rows} onSelect={setSel} /></Panel>}
      <Drawer open={!!sel} title={sel?.label || ''} onClose={() => setSel(null)}>
        {sel && <>
          <p className="drawer-lead">{sel.count}곳에서 이 일을 할 수 있어요. 권장: <b>{sel.recommendation}</b></p>
          <div className="drawer-srcs">{sel.sources.map((s) => <SrcChip key={s} source={s} />)}</div>
          <div className="drawer-caption">이 묶음에 든 스킬 — 실제 이름 · 출처</div>
          {sel.skills.map((sk) => (
            <div className="skill-line" key={sk.id}><span className="id">{sk.id}</span><span className="src">{sk.source}{sk.enabled ? '' : ' · 꺼짐'}</span></div>
          ))}
          <Link className="btn primary drawer-cta" to={`/recommend/${encodeURIComponent(sel.capability)}`}>이 작업 추천 받기 →</Link>
        </>}
      </Drawer>
    </>
  );
}
