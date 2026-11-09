import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { ComplianceChip, ComplianceState } from '../../shared/ui/compliance-chip';
import { Icon } from '../../shared/ui/icon';

interface Item { id: string; parent_id: string | null; is_category: boolean; catalog_code: string | null; title: string;
                 translations: { en?: { title?: string } }; due_date: string | null; is_overdue: boolean;
                 compliance_state: ComplianceState; is_applicable: boolean }
interface Result { pdf_url: string; docx_url: string; preview_url: string }

/** Choose the checklist points to include, then generate PDF + Word. */
@Component({
  selector: 'app-select-points',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, ComplianceChip, Icon],
  template: `
    <nav class="mb-2 text-sm text-slate-500"><a routerLink="/reports" class="hover:underline">{{ 'nav.reports' | transloco }}</a> / {{ title() }}</nav>
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">{{ 'reports.selectTitle' | transloco }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ orgName() }} · {{ title() }}</p>
      </div>
      <button type="button" class="btn-primary" [disabled]="!selected().size || busy()" (click)="generate()">
        <app-icon name="report" [size]="16" /> {{ (busy() ? 'reports.generating' : 'reports.generate') | transloco }}</button>
    </div>

    <div class="mb-4 grid gap-4 sm:grid-cols-3">
      <div class="card p-4"><p class="text-sm text-slate-500">{{ 'reports.selected' | transloco }}</p><p class="text-2xl font-semibold">{{ selected().size }}</p></div>
      <div class="card p-4"><p class="text-sm text-slate-500">{{ 'reports.onTrack' | transloco }}</p><p class="text-2xl font-semibold text-emerald-700">{{ onTrack() }}</p></div>
      <div class="card p-4"><p class="text-sm text-slate-500">{{ 'reports.overdueLabel' | transloco }}</p><p class="text-2xl font-semibold text-red-700">{{ overdue() }}</p></div>
    </div>

    @if (result(); as r) {
      <div class="card mb-4 flex flex-wrap items-center gap-3 border-emerald-200 bg-emerald-50 p-4">
        <span class="flex-1 text-sm text-emerald-800">{{ 'reports.ready' | transloco }}</span>
        <a class="btn-secondary" [href]="r.preview_url" target="_blank" rel="noopener"><app-icon name="eye" [size]="16" /> {{ 'reports.preview' | transloco }}</a>
        <a class="btn-secondary" [href]="r.pdf_url" rel="noopener"><app-icon name="download" [size]="16" /> PDF</a>
        <a class="btn-secondary" [href]="r.docx_url" rel="noopener"><app-icon name="download" [size]="16" /> Word</a>
      </div>
    }

    <div class="card">
      <label class="flex items-center gap-3 border-b border-slate-100 p-3 text-sm font-medium">
        <input type="checkbox" [checked]="allSelected()" (change)="toggleAll($any($event.target).checked)" />
        {{ 'reports.selectAll' | transloco }} <span class="ml-auto text-xs text-slate-500">{{ selected().size }}/{{ leaves().length }}</span>
      </label>
      @for (g of groups(); track g.cat.id) {
        <p class="bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{{ tr(g.cat) }}</p>
        @for (i of g.items; track i.id) {
          <label class="flex items-center gap-3 border-b border-slate-50 px-3 py-2 text-sm hover:bg-slate-50">
            <input type="checkbox" [checked]="selected().has(i.id)" (change)="toggle(i.id)" />
            <span class="w-16 font-mono text-xs text-brand-700">{{ i.catalog_code }}</span>
            <span class="flex-1">{{ tr(i) }}</span>
            @if (i.due_date) { <span class="text-xs text-slate-500">{{ 'reports.due' | transloco }} {{ i.due_date.split('-').reverse().join('/') }}</span> }
            <app-compliance-chip [state]="i.compliance_state" />
          </label>
        }
      }
    </div>
  `,
})
export class SelectPointsPage {
  readonly checklistId = input.required<string>();
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  private readonly lang = toSignal(this.t.langChanges$, { initialValue: this.t.getActiveLang() });
  protected readonly title = signal('');
  protected readonly orgName = signal('');
  protected readonly items = signal<Item[]>([]);
  protected readonly selected = signal(new Set<string>());
  protected readonly busy = signal(false);
  protected readonly result = signal<Result | null>(null);

  protected readonly leaves = computed(() => this.items().filter((i) => !i.is_category));
  protected readonly groups = computed(() => this.items().filter((i) => i.is_category && !i.parent_id)
    .map((cat) => ({ cat, items: this.items().filter((i) => i.parent_id === cat.id) })));
  protected readonly allSelected = computed(() => this.leaves().length > 0 && this.selected().size === this.leaves().length);
  protected readonly onTrack = computed(() => this.leaves().filter((i) => !i.is_overdue).length);
  protected readonly overdue = computed(() => this.leaves().filter((i) => i.is_overdue).length);

  constructor() {
    effect(() => { void this.load(this.checklistId()); });
  }

  protected tr(i: Item): string { return this.lang() === 'en' ? (i.translations?.en?.title ?? i.title) : i.title; }

  protected toggle(id: string): void {
    this.selected.update((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    this.result.set(null);
  }
  protected toggleAll(on: boolean): void {
    this.selected.set(on ? new Set(this.leaves().map((i) => i.id)) : new Set());
    this.result.set(null);
  }

  private async load(id: string): Promise<void> {
    const { data: cl } = await this.sb.client.from('checklists').select('title, organizations(name)').eq('id', id).single();
    const c = cl as unknown as { title: string; organizations: { name: string } } | null;
    this.title.set(c?.title ?? '');
    this.orgName.set(c?.organizations?.name ?? '');
    const { data } = await this.sb.client.from('checklist_items_state')
      .select('id, parent_id, is_category, catalog_code, title, translations, due_date, is_overdue, compliance_state, is_applicable')
      .eq('checklist_id', id).order('sort_order');
    this.items.set((data ?? []) as Item[]);
  }

  protected async generate(): Promise<void> {
    this.busy.set(true);
    this.result.set(null);
    try {
      this.result.set(await this.sb.fn<Result>('report-generate', {
        checklist_id: this.checklistId(), item_ids: [...this.selected()], lang: this.lang() }));
    } catch (e) {
      this.toast.error(errorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
