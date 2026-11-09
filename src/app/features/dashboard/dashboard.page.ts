import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { LocaleService } from '../../core/i18n';
import { Supabase } from '../../core/supabase';
import { ComplianceChip, ComplianceState } from '../../shared/ui/compliance-chip';
import { PageHeader } from '../../shared/ui/page-header';

interface Summary { entity_count: number; total: number; regular: number; atencao: number; critico: number;
                    expiring_window: number; expired: number; documents: number }
interface CriticalItem { id: string; organization_id: string; catalog_code: string; title: string; due_date: string;
                         compliance_state: ComplianceState; org_name?: string }
interface FeedRow { id: number; occurred_at: string; actor_name: string | null; event: string; table_name: string | null;
                    record_title: string | null; organization_name: string | null }

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, DatePipe, PageHeader, ComplianceChip],
  template: `
    <app-page-header [title]="'nav.dashboard' | transloco"
                     [subtitle]="'dashboard.greeting' | transloco: { name: firstName(), org: ctx.active()?.name }" />

    <!-- KPI tiles -->
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      @for (k of kpis(); track k.key) {
        <div class="card p-4">
          <p class="flex items-center gap-2 text-sm text-slate-500"><span class="size-2 rounded-full" [class]="k.dot"></span>{{ 'dashboard.kpi.' + k.key | transloco }}</p>
          <p class="mt-2 text-3xl font-semibold text-slate-900">{{ k.value }}</p>
          <p class="mt-1 text-xs text-slate-400">{{ 'dashboard.kpi.' + k.key + 'Hint' | transloco: k.params }}</p>
        </div>
      }
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-3">
      <!-- donut -->
      <section class="card p-5 lg:col-span-2">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-slate-900">{{ 'dashboard.status' | transloco }}</h2>
          <span class="text-xs text-slate-400">{{ 'dashboard.live' | transloco }}</span>
        </div>
        <div class="mt-4 flex flex-col items-center gap-8 sm:flex-row">
          <svg viewBox="0 0 42 42" class="size-44 -rotate-90" role="img" [attr.aria-label]="'dashboard.status' | transloco">
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="#e2e8f0" stroke-width="5" />
            @for (seg of segments(); track seg.key) {
              <circle cx="21" cy="21" r="15.915" fill="none" [attr.stroke]="seg.color" stroke-width="5"
                      [attr.stroke-dasharray]="seg.pct + ' ' + (100 - seg.pct)" [attr.stroke-dashoffset]="-seg.offset" />
            }
          </svg>
          <div class="text-center sm:text-left">
            <p class="text-4xl font-semibold text-slate-900">{{ compliantPct() }}%</p>
            <p class="text-sm text-slate-500">{{ 'dashboard.compliant' | transloco }}</p>
            <ul class="mt-4 space-y-1.5 text-sm">
              @for (seg of segments(); track seg.key) {
                <li class="flex items-center gap-2"><span class="size-2.5 rounded-full" [style.background]="seg.color"></span>
                  <span class="w-32">{{ 'compliance.' + seg.key | transloco }}</span><span class="font-medium">{{ seg.count }}</span></li>
              }
            </ul>
          </div>
        </div>
      </section>

      <!-- recent activity -->
      <section class="card p-5">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-slate-900">{{ 'dashboard.recent' | transloco }}</h2>
          @if (ctx.can('manager')) { <a routerLink="/audit" class="text-xs font-medium text-brand-600 hover:underline">{{ 'common.seeAll' | transloco }}</a> }
        </div>
        <ul class="mt-3 divide-y divide-slate-100 text-sm">
          @for (r of feed(); track r.id) {
            <li class="py-2">
              <p class="font-medium text-slate-700">{{ 'audit.event.' + r.event | transloco }} — {{ r.record_title || ('audit.table.' + r.table_name | transloco) }}</p>
              <p class="text-xs text-slate-400">{{ r.actor_name || ('audit.system' | transloco) }} · {{ r.occurred_at | date: 'short' : undefined : dateLocale() }}</p>
            </li>
          } @empty {
            <li class="py-6 text-center text-slate-400">{{ 'dashboard.noActivity' | transloco }}</li>
          }
        </ul>
      </section>
    </div>

    <!-- critical points -->
    <section class="card mt-6 p-5">
      <h2 class="font-semibold text-slate-900">{{ 'dashboard.critical' | transloco }}</h2>
      <table class="table-base mt-3">
        <thead><tr><th>ID</th><th>{{ 'ficha.item' | transloco }}</th><th>{{ 'nav.entities' | transloco }}</th><th>{{ 'ficha.validity' | transloco }}</th><th>{{ 'ficha.state' | transloco }}</th></tr></thead>
        <tbody>
          @for (i of critical(); track i.id) {
            <tr>
              <td class="font-mono text-xs text-brand-700">{{ i.catalog_code }}</td>
              <td><a class="hover:underline" [routerLink]="['/entities', i.organization_id, 'ficha']">{{ i.title }}</a></td>
              <td class="text-slate-500">{{ i.org_name }}</td>
              <td>{{ i.due_date | date: 'dd/MM/yyyy' }}</td>
              <td><app-compliance-chip [state]="i.compliance_state" /></td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="py-6 text-center text-slate-400">{{ 'dashboard.noCritical' | transloco }}</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class DashboardPage {
  protected readonly ctx = inject(ContextStore);
  private readonly sb = inject(Supabase);
  private readonly locale = inject(LocaleService);
  protected readonly summary = signal<Summary | null>(null);
  protected readonly critical = signal<CriticalItem[]>([]);
  protected readonly feed = signal<FeedRow[]>([]);
  protected readonly dateLocale = () => this.locale.dateLocale();

  protected readonly firstName = computed(() => (this.ctx.profile()?.full_name ?? '').split(' ')[0]);
  protected readonly kpis = computed(() => {
    const s = this.summary();
    return [
      { key: 'total', value: s?.total ?? '–', dot: 'bg-brand-500', params: { n: s?.entity_count ?? 0 } },
      { key: 'compliant', value: s?.regular ?? '–', dot: 'bg-emerald-500', params: { pct: this.compliantPct() } },
      { key: 'expiring', value: s?.expiring_window ?? '–', dot: 'bg-amber-500', params: {} },
      { key: 'expired', value: s?.expired ?? '–', dot: 'bg-red-500', params: {} },
    ];
  });
  protected readonly compliantPct = computed(() => {
    const s = this.summary();
    return s && s.total ? Math.round((s.regular / s.total) * 100) : 0;
  });
  protected readonly segments = computed(() => {
    const s = this.summary();
    if (!s || !s.total) return [];
    let offset = 0;
    return (['regular', 'atencao', 'critico'] as const).map((key) => {
      const count = s[key];
      const pct = (count / s.total) * 100;
      const seg = { key, count, pct, offset, color: { regular: '#10b981', atencao: '#f59e0b', critico: '#ef4444' }[key] };
      offset += pct;
      return seg;
    });
  });

  constructor() {
    effect(() => {
      const org = this.ctx.active();
      if (org) void this.load(org.id);
    });
  }

  private async load(orgId: string): Promise<void> {
    const entityIds = this.ctx.entities().map((e) => e.id);
    const names = new Map(this.ctx.entities().map((e) => [e.id, e.name]));
    const [summary, critical, feed] = await Promise.all([
      this.sb.rpc<Summary>('dashboard_summary', { org: orgId }),
      this.sb.client.from('checklist_items_state')
        .select('id, organization_id, catalog_code, title, due_date, compliance_state')
        .in('organization_id', entityIds).in('compliance_state', ['atencao', 'critico'])
        .order('due_date').limit(10),
      this.ctx.can('manager')
        ? this.sb.client.rpc('audit_feed', { org: orgId, p_limit: 6 })
        : Promise.resolve({ data: [] as FeedRow[] }),
    ]);
    this.summary.set(summary);
    this.critical.set(((critical.data ?? []) as CriticalItem[]).map((i) => ({ ...i, org_name: names.get(i.organization_id) })));
    this.feed.set((feed.data ?? []) as FeedRow[]);
  }
}
