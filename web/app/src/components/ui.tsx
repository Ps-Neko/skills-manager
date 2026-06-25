import { useEffect, useRef, type ReactNode } from 'react';

export function Panel({ title, note, link, children }: { title?: string; note?: string; link?: ReactNode; children: ReactNode }) {
  return (
    <div className="panel">
      {title && <div className="panel-head"><h2>{title}</h2>{note && <span className="note">{note}</span>}{link && <span className="link">{link}</span>}</div>}
      <div className="panel-body">{children}</div>
    </div>
  );
}
export const Badge = ({ kind, children }: { kind: string; children: ReactNode }) => <span className={`badge ${kind}`}>{children}</span>;
export const SrcChip = ({ source }: { source: string }) => <span className="src-chip">{source}</span>;

export const SkeletonRows = ({ rows = 5, h = 18 }: { rows?: number; h?: number }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '6px 0' }}>
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="skel" style={{ height: h, width: `${90 - (i % 3) * 12}%` }} />)}
  </div>
);
export const EmptyState = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="state" role="status"><h3>{title}</h3>{children}</div>
);
export function ErrorState({ error, hint }: { error: unknown; hint?: string }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="state">
      <h3>{hint || '문제가 생겼어요.'}</h3>
      <p style={{ fontSize: 13 }}>CLI 호출이 실패했습니다. ~/.claude/skills 경로나 로컬 서버 상태를 확인해 주세요.</p>
      <details><summary>자세한 로그 보기</summary><pre>{msg}</pre></details>
    </div>
  );
}
export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  // 포커스 관리(모달 계약): 열릴 때 드로어로 포커스 이동, 닫힐 때 연 곳으로 복귀. open 전이마다 한 번씩만(deps=[open]).
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prevFocus.current?.focus?.();
  }, [open]);
  // Esc로 닫기 + Tab 가두기 — aria-modal의 약속(배경은 비활성)을 실제로 지킨다. (Nielsen #3 비상 탈출구)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><h3>{title}</h3><button className="x" onClick={onClose} aria-label="닫기">×</button></div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}
export function CopyCmd({ cmd }: { cmd: string }) {
  return (
    <div className="cmd"><code>{cmd}</code>
      <button className="copy" onClick={() => navigator.clipboard?.writeText(cmd)}>복사</button>
    </div>
  );
}
