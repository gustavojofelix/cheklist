import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ReferenceService } from '../../core/reference.service';
import { Supabase } from '../../core/supabase';
import { PageHeader } from '../../shared/ui/page-header';

interface AdminOrg {
  id: string; name: string; tax_id: string | null; sector: string | null; created_at: string;
  platform_access_authorized_at: string | null;
  subscriptions: { status: string; current_period_end: string; trial_ends_at: string | null; plans: { name: string } | null } | null;
  branches: { count: number }[];
}

/** Back office: customer accounts (metadata only — customer data needs consent + an operator session). */
@Component({
  selector: 'app-admin-organizations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, DatePipe, PageHeader],
  template: `
    <app-page-header [title]="'admin.nav.organizations' | transloco" [subtitle]="'admin.orgs.subtitle' | transloco: { n: orgs().length }" />
    <div class="mb-4 grid gap-4 sm:grid-cols-4">
      @for (k of kpis(); track k.key) {
        <div class="card p-4"><p class="text-sm text-slate-500">{{ 'admin.kpi.' + k.key | transloco }}</p><p class="mt-1 text-2xl font-semibold">{{ k.value }}</p></div>
      }
    </div>
    <div class="card p-4">
      <input class="input mb-3 max-w-sm" [(ngModel)]="q" [placeholder]="'admin.orgs.search' | transloco" [attr.aria-label]="'admin.orgs.search' | transloco" />
      <div class="overflow-x-auto">
        <table class="table-base">
          <thead><tr><th>{{ 'admin.orgs.org' | transloco }}</th><th>NUIT</th><th>{{ 'org.sector' | transloco }}</th><th>{{ 'admin.orgs.plan' | transloco }}</th>
            <th>{{ 'common.status' | transloco }}</th><th>{{ 'admin.orgs.branches' | transloco }}</th><th>{{ 'admin.orgs.access' | transloco }}</th><th>{{ 'admin.orgs.created' | transloco }}</th></tr></thead>
          <tbody>
            @for (o of filtered(); track o.id) {
              <tr>
                <td class="font-medium">{{ o.name }}</td>
                <td class="font-mono text-xs">{{ o.tax_id || '—' }}</td>
                <td class="max-w-48 truncate text-slate-500">{{ refs.label('sector', o.sector) }}</td>
                <td>{{ o.subscriptions?.plans?.name ?? '—' }}</td>
                <td>@if (o.subscriptions; as s) { <span class="chip bg-slate-100 text-slate-700">{{ 'billing.status.' + s.status | transloco }}</span> }</td>
                <td>{{ o.branches[0]?.count ?? 0 }}</td>
                <td>@if (o.platform_access_authorized_at) { <span class="chip bg-emerald-100 text-emerald-800">{{ 'admin.orgs.authorized' | transloco }}</span> }
                    @else { <span class="chip bg-slate-100 text-slate-500">{{ 'admin.orgs.notAuthorized' | transloco }}</span> }</td>
                <td class="text-slate-500">{{ o.created_at | date: 'dd/MM/yyyy' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="py-8 text-center text-slate-400">{{ 'common.loading' | transloco }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-slate-500">{{ 'admin.orgs.consentNote' | transloco }}</p>
    </div>
  `,
})
export class AdminOrganizationsPage implements OnInit {
  private readonly sb = inject(Supabase);
  protected readonly refs = inject(ReferenceService);
  protected readonly orgs = signal<AdminOrg[]>([]);
  protected q = '';
  protected readonly kpis = computed(() => {
    const o = this.orgs();
    const st = (s: string) => o.filter((x) => x.subscriptions?.status === s).length;
    return [
      { key: 'customers', value: o.length }, { key: 'active', value: st('active') },
      { key: 'trial', value: st('trial') }, { key: 'expired', value: st('expired') + st('canceled') },
    ];
  });

  async ngOnInit(): Promise<void> {
    const { data } = await this.sb.client.from('organizations')
      .select('id, name, tax_id, sector, created_at, platform_access_authorized_at, subscriptions(status, current_period_end, trial_ends_at, plans(name)), branches:organizations!parent_id(count)')
      .is('parent_id', null).is('deleted_at', null).order('created_at', { ascending: false });
    this.orgs.set((data ?? []) as unknown as AdminOrg[]);
  }

  protected filtered(): AdminOrg[] {
    const q = this.q.trim().toLowerCase();
    return q ? this.orgs().filter((o) => o.name.toLowerCase().includes(q) || (o.tax_id ?? '').includes(q)) : this.orgs();
  }
}
