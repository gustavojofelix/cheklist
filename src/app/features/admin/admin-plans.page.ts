import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { PageHeader } from '../../shared/ui/page-header';

interface Price { id?: string; plan_id?: string; period: string; amount: number; currency: string; is_active: boolean }
interface Plan {
  id: string; slug: string; name: string; description: string | null; is_active: boolean; sort_order: number;
  max_users: number | null; max_branches: number | null; max_documents: number | null; max_storage_bytes: number | null;
  max_ocr: number | null; max_ia: number | null; trial_days: number | null; allows_assisted_ia: boolean;
  extra_user_price: number | null; extra_branch_price: number | null; plan_prices: Price[];
}
const PERIODS = ['monthly', 'quarterly', 'semestral', 'annual'];
const LIMITS = ['max_users', 'max_branches', 'max_documents', 'max_ocr', 'max_ia', 'trial_days'] as const;

/** Back office: plans, limits (empty = unlimited) and prices per billing period. */
@Component({
  selector: 'app-admin-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, PageHeader],
  template: `
    <app-page-header [title]="'admin.nav.plans' | transloco" [subtitle]="'admin.plans.subtitle' | transloco" />
    <div class="grid gap-4 xl:grid-cols-2">
      @for (p of plans(); track p.id) {
        <form class="card space-y-3 p-5" (ngSubmit)="save(p)">
          <div class="flex items-center gap-2">
            <input class="input !w-48 font-semibold" [name]="'name' + p.id" [(ngModel)]="p.name" [attr.aria-label]="'common.name' | transloco" />
            <span class="font-mono text-xs text-slate-600">{{ p.slug }}</span>
            <label class="ml-auto flex items-center gap-1.5 text-sm"><input type="checkbox" [name]="'act' + p.id" [(ngModel)]="p.is_active" /> {{ 'admin.plans.active' | transloco }}</label>
          </div>
          <textarea class="input" rows="2" [name]="'desc' + p.id" [(ngModel)]="p.description" [attr.aria-label]="'admin.plans.description' | transloco"></textarea>
          <div class="grid grid-cols-3 gap-3">
            @for (k of limits; track k) {
              <label class="text-xs text-slate-600">{{ 'admin.plans.' + k | transloco }}
                <input type="number" min="0" class="input mt-1" [name]="k + p.id" [(ngModel)]="$any(p)[k]" [placeholder]="'admin.plans.unlimited' | transloco" /></label>
            }
            <label class="text-xs text-slate-600">{{ 'admin.plans.storageGb' | transloco }}
              <input type="number" min="0" step="0.1" class="input mt-1" [name]="'st' + p.id" [ngModel]="gb(p.max_storage_bytes)" (ngModelChange)="p.max_storage_bytes = bytes($event)" [placeholder]="'admin.plans.unlimited' | transloco" /></label>
            <label class="text-xs text-slate-600">{{ 'admin.plans.extraUser' | transloco }}
              <input type="number" min="0" class="input mt-1" [name]="'eu' + p.id" [(ngModel)]="p.extra_user_price" /></label>
            <label class="text-xs text-slate-600">{{ 'admin.plans.extraBranch' | transloco }}
              <input type="number" min="0" class="input mt-1" [name]="'eb' + p.id" [(ngModel)]="p.extra_branch_price" /></label>
          </div>
          <label class="flex items-center gap-1.5 text-sm"><input type="checkbox" [name]="'ia' + p.id" [(ngModel)]="p.allows_assisted_ia" /> {{ 'admin.plans.assistedIa' | transloco }}</label>
          <div>
            <p class="label">{{ 'admin.plans.prices' | transloco }}</p>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              @for (per of periods; track per) {
                <label class="text-xs text-slate-600">{{ 'admin.period.' + per | transloco }} (MZN)
                  <input type="number" min="0" step="0.01" class="input mt-1" [name]="per + p.id" [ngModel]="price(p, per)" (ngModelChange)="setPrice(p, per, $event)" [placeholder]="'admin.plans.notOffered' | transloco" /></label>
              }
            </div>
          </div>
          <div class="flex justify-end"><button type="submit" class="btn-primary">{{ 'common.save' | transloco }}</button></div>
        </form>
      }
    </div>
  `,
})
export class AdminPlansPage implements OnInit {
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  protected readonly plans = signal<Plan[]>([]);
  protected readonly periods = PERIODS;
  protected readonly limits = LIMITS;

  async ngOnInit(): Promise<void> {
    const { data } = await this.sb.client.from('plans').select('*, plan_prices(*)').order('sort_order');
    this.plans.set((data ?? []) as Plan[]);
  }

  protected gb(b: number | null): number | null { return b === null ? null : Math.round((b / 1024 ** 3) * 100) / 100; }
  protected bytes(gb: number | null | ''): number | null { return gb === null || gb === '' ? null : Math.round(Number(gb) * 1024 ** 3); }
  protected price(p: Plan, period: string): number | null {
    const x = p.plan_prices.find((pp) => pp.period === period && pp.is_active);
    return x ? x.amount : null;
  }
  protected setPrice(p: Plan, period: string, v: number | null | ''): void {
    const x = p.plan_prices.find((pp) => pp.period === period);
    if (v === null || v === '') { if (x) x.is_active = false; return; }
    if (x) { x.amount = Number(v); x.is_active = true; }
    else p.plan_prices.push({ plan_id: p.id, period, amount: Number(v), currency: 'MZN', is_active: true });
  }

  protected async save(p: Plan): Promise<void> {
    const nul = (v: unknown) => (v === '' || v === undefined ? null : v);
    try {
      const { plan_prices, id, slug, ...fields } = p;
      void slug;
      const clean = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, nul(v)]));
      const { error } = await this.sb.client.from('plans').update(clean).eq('id', id);
      if (error) throw error;
      const { error: e2 } = await this.sb.client.from('plan_prices')
        .upsert(plan_prices.map((pp) => ({ ...pp, plan_id: id })), { onConflict: 'plan_id,period,currency' });
      if (e2) throw e2;
      this.toast.success('common.saved');
      await this.ngOnInit();
    } catch (e) { this.toast.error(errorKey(e)); }
  }
}
