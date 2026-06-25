import { useMemo, type KeyboardEvent } from 'react';
import type { DuplicateGroup } from '../lib/types';
import { Badge, SrcChip } from './ui';
const ko: Record<string, string> = { high: '높음', medium: '보통', low: '낮음' };
export function DuplicateTable({ rows, onSelect, limit }: { rows: DuplicateGroup[]; onSelect?: (g: DuplicateGroup) => void; limit?: number }) {
  // limit이 있을 때만 잘라 화면 전환마다 새 배열을 만들지 않게 메모이즈한다.
  const data = useMemo(() => (limit ? rows.slice(0, limit) : rows), [rows, limit]);
  return (
    <table className="tbl">
      <thead><tr><th className="rk">#</th><th>작업</th><th className="r">곳수</th><th>출처</th><th>중복도</th><th>권장 액션</th>{onSelect && <th></th>}</tr></thead>
      <tbody>
        {data.map((g, i) => (
          <tr
            key={g.id}
            className={onSelect ? 'click' : ''}
            onClick={() => onSelect?.(g)}
            {...(onSelect && {
              role: 'button',
              tabIndex: 0,
              'aria-expanded': false,
              'aria-label': `${g.label} 상세 보기`,
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(g);
                }
              },
            })}
          >
            <td className="rk">{String(i + 1).padStart(2, '0')}</td>
            <td className="cell-label">{g.label}</td>
            <td className="r cell-count">{g.count}</td>
            <td>{g.sources.map((s) => <SrcChip key={s} source={s} />)}</td>
            <td><Badge kind={g.severity}>{ko[g.severity]}</Badge></td>
            <td className="rec-txt">{g.recommendation}</td>
            {onSelect && <td><button className="linkbtn">상세</button></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
