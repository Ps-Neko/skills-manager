export interface SourceCount { source: string; count: number; }
export interface SummaryDTO { totalSkills: number; duplicateGroups: number; totalGroups: number; activePlugins: number; agents: number; sources: number; sourceDistribution: SourceCount[]; mirrorsFolded: number; skillsPath: string; version: string; readOnly: boolean; hasSkillsFolder: boolean; }
export interface StatusDTO { cliConnected: boolean; readOnly: boolean; fixture: boolean; reason?: string; lastScannedAt: string | null; summary: SummaryDTO | null; }
export interface DupSkill { id: string; name: string; source: string; enabled: boolean; description: string; }
export type Severity = 'high' | 'medium' | 'low';
export interface DuplicateGroup { id: string; capability: string; label: string; count: number; sources: string[]; severity: Severity; recommendation: string; duplicateLevel: string; skills: DupSkill[]; }
export interface ScanDTO { summary: SummaryDTO; duplicates: DuplicateGroup[]; }
export interface RecItem { id: string; capability: string; label: string; count: number; sources: string[]; solo: boolean; recommended: { id: string; why: string } | null; alternatives: { id: string; source: string }[]; }
export interface WorkflowStep { capability: string; note: string; kind: string; label: string; sources: string[]; count: number; skills: string[]; }
export interface Workflow { name: string; label: string; source: string; steps: WorkflowStep[]; }
export interface ManageDTO { summary: { standaloneTotal: number; gitUpdatable: number; noUpdatePath: number; pluginNote: string }; standalone: { name: string; kind: string; updatable: boolean; remote: string }[]; plugins: { name: string; enabled: boolean }[]; }
export interface RemovePreview { mode: string; target: string; willMoveTo?: string; confirmToken?: string; residue?: { surface: string; path: string; detail: string; risk: string }[]; ok?: boolean; }
export interface AuditSkill { id: string; name: string; source: string; }
export interface AuditGroup { capability: string; label: string; count: number; keep: { id: string; name: string; source: string; why: string } | null; removable: AuditSkill[]; pluginBound: AuditSkill[]; }
export interface AuditDTO { summary: { totalSkills: number; removableCount: number; afterCount: number; groups: number }; groups: AuditGroup[]; note: string; }
