export type LegalActKind = 'lei' | 'decreto_lei' | 'decreto' | 'diploma_ministerial' | 'resolucao' | 'regulamento' | 'codigo' | 'outro';
export type LegalDocRole = 'original' | 'alteracao' | 'revisto';
export const LEGAL_ACT_KINDS: LegalActKind[] = ['codigo', 'lei', 'decreto_lei', 'decreto', 'diploma_ministerial', 'resolucao', 'regulamento', 'outro'];

export interface LegalAct {
  id: string; reference: string | null; title: string; kind: LegalActKind; number: string | null; act_date: string | null;
  area: string | null; summary: string | null; created_at: string; updated_at: string;
}

export interface LegalDocument {
  id: string; act_id: string; role: LegalDocRole; diploma: string; publication: string | null; published_on: string | null;
  effect: string | null; storage_path: string; original_name: string; mime_type: string; size_bytes: number; created_at: string;
}

export interface LegalActRow extends LegalAct { legal_act_documents: Pick<LegalDocument, 'role'>[] }

/** The pairing: the original, its alterations oldest first (numbered 1, 2, 3…), then the revised text. */
export function pairing(docs: LegalDocument[]): { original: LegalDocument | null; alterations: LegalDocument[]; revised: LegalDocument | null } {
  const byDate = (a: LegalDocument, b: LegalDocument) =>
    (a.published_on ?? '9999').localeCompare(b.published_on ?? '9999') || a.created_at.localeCompare(b.created_at);
  return {
    original: docs.find((d) => d.role === 'original') ?? null,
    alterations: docs.filter((d) => d.role === 'alteracao').sort(byDate),
    revised: docs.find((d) => d.role === 'revisto') ?? null,
  };
}
