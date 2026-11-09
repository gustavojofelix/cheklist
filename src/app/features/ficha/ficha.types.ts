import { ComplianceState } from '../../shared/ui/compliance-chip';

export interface FichaItem {
  id: string; checklist_id: string; organization_id: string; parent_id: string | null; template_item_id: string | null;
  is_category: boolean; catalog_code: string | null; catalog_group: string | null; title: string;
  translations: { en?: { title?: string; description?: string } }; answer: string | null; answer_kind: string;
  bound_field: string | null; applicability: 'yes' | 'depends' | 'no'; is_applicable: boolean; has_validity: boolean;
  due_date: string | null; requires_attachment: boolean; assignee_id: string | null; notes: string | null;
  sort_order: number; row_version: number; compliance_state: ComplianceState; is_overdue: boolean; document_count: number;
  /** Boletim da República publications (children of SOC-16, numbered SOC-16.nn by the database). */
  is_official_gazette: boolean; br_subtype: GazetteSubtype | null; publication_date: string | null; publication_series: string | null;
}

export const GAZETTE_ORIGINALS = ['constituicao_quotas', 'constituicao_sa', 'constituicao_sucursal', 'constituicao_associacao', 'constituicao_consorcio'] as const;
export const GAZETTE_ALTERATIONS = ['alteracao_pacto', 'alteracao_capital', 'alteracao_orgao', 'alteracao_nome'] as const;
export type GazetteSubtype = typeof GAZETTE_ORIGINALS[number] | typeof GAZETTE_ALTERATIONS[number] | 'outros';
export const isOriginal = (s: GazetteSubtype | null): boolean => !!s && s.startsWith('constituicao_');
export const isAlteration = (s: GazetteSubtype | null): boolean => !!s && s.startsWith('alteracao_');
/** The checklist item that holds the Boletim da República publications. */
export const GAZETTE_HOST_CODE = 'SOC-16';

export interface FichaDocument {
  id: string; original_name: string; mime_type: string; size_bytes: number; created_at: string; uploaded_by: string | null;
  item_ids: string[];
}

export interface Category { item: FichaItem; children: FichaItem[] }
