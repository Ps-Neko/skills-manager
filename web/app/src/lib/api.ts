import type { StatusDTO, ScanDTO, RecItem, Workflow, ManageDTO, RemovePreview, AuditDTO } from './types';

// 서버 에러 응답 본문에서 사람용 문구만 안전하게 뽑는다.
// r.json()은 any 를 돌려주므로, unknown 으로 받아 타입 가드로 좁혀 any 누수를 막는다.
async function errorMessage(r: Response): Promise<string> {
  const fallback = `${r.status} ${r.statusText}`;
  const body: unknown = await r.json().catch(() => null);
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error?: unknown }).error;
    if (typeof e === 'string' && e) return e;
  }
  return fallback;
}

// JSON 응답을 호출부가 선언한 타입으로 받는다. fetch().json()은 any 라 경계가 무너지므로
// 여기 한 곳에서만 unknown→T 단언으로 막는다(런타임 검증은 아님 — 서버 DTO 계약을 신뢰).
async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await errorMessage(r));
  return (await r.json()) as T;
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await errorMessage(r));
  return (await r.json()) as T;
}
// 프론트는 'command'를 모른다 — action만 호출한다.
export const api = {
  status: () => get<StatusDTO>('/api/status'),
  scan: () => get<ScanDTO>('/api/scan'),
  rescan: () => post<{ ok: boolean; lastScannedAt: string; totalSkills: number }>('/api/rescan', {}),
  recommend: () => get<{ items: RecItem[] }>('/api/recommend'),
  workflows: () => get<{ workflows: Workflow[] }>('/api/workflows'),
  manage: () => get<ManageDTO>('/api/manage/update-status'),
  audit: () => get<AuditDTO>('/api/audit'),
  residue: (skill: string) => get<{ target: string; surfaces: { surface: string; path: string; detail: string; risk: string }[] }>(`/api/manage/residue/${encodeURIComponent(skill)}`),
  removePreview: (skill: string) => post<RemovePreview>('/api/manage/remove-preview', { skill }),
  removeConfirm: (skill: string, token: string) => post<RemovePreview>('/api/manage/remove-confirm', { skill, token }),
};
