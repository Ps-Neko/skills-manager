import { useQuery } from '@tanstack/react-query';
import { api } from './api';
export const useStatus = () => useQuery({ queryKey: ['status'], queryFn: api.status });
export const useScan = () => useQuery({ queryKey: ['scan'], queryFn: api.scan });
export const useRecommend = () => useQuery({ queryKey: ['recommend'], queryFn: api.recommend });
export const useWorkflows = () => useQuery({ queryKey: ['workflows'], queryFn: api.workflows });
export const useManage = () => useQuery({ queryKey: ['manage'], queryFn: api.manage });
export const useAudit = () => useQuery({ queryKey: ['audit'], queryFn: api.audit });
// (출처 색·점은 제거 — 의미를 인코딩하지 않는 장식이었고, 중성 점으로 바꿔도 빈 토큰으로 남아
//  눈이 해독하려다 헛돈다. 출처 식별은 동반 텍스트/개수가 전담한다. DESIGN.md "색은 의미가 있을 때만")

import { useMutation, useQueryClient } from '@tanstack/react-query';
export function useRescan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.rescan,
    // 다시 스캔은 scan(서버에서 recommend가 공유)·status만 갱신한다. workflows·manage·audit는 그 화면을 볼 때 자연 갱신돼, 한 번에 무거운 재실행이 몰리지 않는다.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['scan'] });
      qc.invalidateQueries({ queryKey: ['recommend'] });
    },
  });
}
