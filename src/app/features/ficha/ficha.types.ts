import { ComplianceState } from '../../shared/ui/compliance-chip';

export interface FichaItem {
  id: string; checklist_id: string; organization_id: string; parent_id: string | null; template_item_id: string | null;
  is_category: boolean; catalog_code: string | null; catalog_group: string | null; title: string;
  translations: { en?: { title?: string; description?: string } }; answer: string | null; answer_kind: string;
  bound_field: string | null; applicability: 'yes' | 'depends' | 'no'; is_applicable: boolean; has_validity: boolean;
  due_date: string | null; requires_attachment: boolean; assignee_id: string | null; notes: string | null;
  sort_order: number; row_version: number; compliance_state: ComplianceState; is_overdue: boolean; document_count: number;
}

export interface FichaDocument {
  id: string; original_name: string; mime_type: string; size_bytes: number; created_at: string; uploaded_by: string | null;
  item_ids: string[];
}

export interface Category { item: FichaItem; children: FichaItem[] }
