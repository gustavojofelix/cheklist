import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { Supabase } from '../../core/supabase';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';

interface Row { id: string; title: string; organization_id: string; org_name: string; items: number; overdue: number }

@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, PageHeader, Icon],
  template: `
    <app-page-header [title]="'nav.reports' | transloco" [subtitle]="'reports.subtitle' | transloco" />
    <div class="card divide-y divide-slate-100">
      @for (r of rows(); track r.id) {
        <div class="flex flex-wrap items-center gap-3 p-4">
          <span class="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><app-icon name="report" /></span>
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ r.title }}</p>
            <p class="text-sm text-slate-500">{{ r.org_name }} · {{ 'ficha.itemsCount' | transloco: { n: r.items } }}
              @if (r.overdue) { · <span class="text-red-600">{{ 'reports.overdue' | transloco: { n: r.overdue } }}</span> }</p>
          </div>
          <a class="btn-primary" [routerLink]="['/reports', r.id]"><app-icon name="report" [size]="16" /> {{ 'reports.generate' | transloco }}</a>
        </div>
      } @empty {
        <p class="p-8 text-center text-slate-500">{{ 'common.loading' | transloco }}</p>
      }
    </div>
  `,
})
export class ReportsPage {
  private readonly ctx = inject(ContextStore);
  private readonly sb = inject(Supabase);
  protected readonly rows = signal<Row[]>([]);

  constructor() {
    effect(() => { if (this.ctx.active()) void this.load(); });
  }

  private async load(): Promise<void> {
    const ents = this.ctx.entities();
    const ids = ents.map((e) => e.id);
    const [cl, items] = await Promise.all([
      this.sb.client.from('checklists').select('id, title, organization_id').in('organization_id', ids),
      this.sb.client.from('checklist_items_state').select('checklist_id, is_overdue').in('organization_id', ids).eq('is_category', false),
    ]);
    const its = (items.data ?? []) as { checklist_id: string; is_overdue: boolean }[];
    this.rows.set(((cl.data ?? []) as { id: string; title: string; organization_id: string }[]).map((c) => ({
      ...c, org_name: ents.find((e) => e.id === c.organization_id)?.name ?? '',
      items: its.filter((i) => i.checklist_id === c.id).length,
      overdue: its.filter((i) => i.checklist_id === c.id && i.is_overdue).length,
    })));
  }
}
