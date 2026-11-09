import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { Supabase } from './supabase';

export interface RefItem {
  list_key: string; value: string; label: { pt: string; en?: string }; parent_value: string | null;
  extra: { definition?: { pt: string; en?: string } }; sort_order: number;
}
export interface RefOption { value: string; label: string; hint?: string }

/** Reference lists (entity types, sectors, provinces…) loaded once and localized. */
@Injectable({ providedIn: 'root' })
export class ReferenceService {
  private readonly sb = inject(Supabase);
  private readonly i18n = inject(TranslocoService);
  private readonly items = signal<RefItem[]>([]);
  private readonly lang = toSignal(this.i18n.langChanges$, { initialValue: this.i18n.getActiveLang() });
  private loading: Promise<void> | null = null;
  readonly ready = computed(() => this.items().length > 0);

  load(): Promise<void> {
    this.loading ??= (async () => {
      const { data, error } = await this.sb.client.from('reference_lists').select('*')
        .eq('is_active', true).order('sort_order');
      if (error) { this.loading = null; throw error; }
      this.items.set(data as RefItem[]);
    })();
    return this.loading;
  }

  options(key: string, parent?: string | null): RefOption[] {
    const lang = this.lang() as 'pt' | 'en';
    return this.items()
      .filter((i) => i.list_key === key && (parent === undefined || i.parent_value === parent))
      .map((i) => ({
        value: i.value,
        label: i.label[lang] ?? i.label.pt,
        hint: i.extra?.definition ? (i.extra.definition[lang] ?? i.extra.definition.pt) : undefined,
      }));
  }

  label(key: string, value: string | null | undefined): string {
    if (!value) return '';
    const lang = this.lang() as 'pt' | 'en';
    const it = this.items().find((i) => i.list_key === key && i.value === value);
    return it ? (it.label[lang] ?? it.label.pt) : value;
  }
}
