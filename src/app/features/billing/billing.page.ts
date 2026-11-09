import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { Supabase } from '../../core/supabase';
import { PageHeader } from '../../shared/ui/page-header';

interface Plan { id: string; slug: string; name: string; description: string; translations: { en?: { name?: string; description?: string } };
                 max_users: number | null; max_branches: number | null; max_documents: number | null; max_storage_bytes: number | null;
                 max_ocr: number | null; max_ia: number | null; plan_prices: { period: string; amount: number; currency: string }[] }
interface Usage { users: number; documents: number; storage: number }

/** Subscription overview + plan catalogue (checkout arrives in iteration 6). */
@Component({
  selector: 'app-billing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, DatePipe, DecimalPipe, PageHeader],
  template: `
    <app-page-header [title]="'nav.billing' | transloco" [subtitle]="'billing.subtitle' | transloco" />
    @if (ctx.subscription(); as s) {
      <section class="card p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm text-slate-500">{{ 'billing.currentPlan' | transloco }}</p>
            <p class="text-xl font-semibold">{{ s.plan }} <span class="chip ml-2 bg-brand-100 text-brand-700">{{ 'billing.status.' + s.status | transloco }}</span></p>
          </div>
          <p class="text-sm text-slate-500">
            {{ (s.status === 'trial' ? 'billing.trialEnds' : 'billing.periodEnds') | transloco }}
            <strong>{{ (s.trial_ends_at ?? s.current_period_end) | date: 'dd/MM/yyyy' }}</strong>
          </p>
        </div>
        @if (current(); as p) {
          <div class="mt-5 grid gap-4 sm:grid-cols-3">
            @for (u of usageBars(p); track u.key) {
              <div>
                <div class="flex justify-between text-sm"><span>{{ 'billing.usage.' + u.key | transloco }}</span>
                  <span class="text-slate-500">{{ u.label }}</span></div>
                <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div class="h-full rounded-full" [class]="u.pct >= 95 ? 'bg-red-500' : u.pct >= 80 ? 'bg-amber-500' : 'bg-brand-500'" [style.width.%]="u.pct"></div>
                </div>
              </div>
            }
          </div>
        }
      </section>
    }

    <h2 class="mt-8 mb-3 font-semibold">{{ 'billing.plans' | transloco }}</h2>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      @for (p of plans(); track p.id) {
        <article class="card flex flex-col p-5" [class.ring-2]="p.slug === ctx.subscription()?.plan_slug" [class.ring-brand-500]="p.slug === ctx.subscription()?.plan_slug">
          <h3 class="font-semibold">{{ lang() === 'en' ? (p.translations.en?.name ?? p.name) : p.name }}</h3>
          <p class="mt-1 text-sm text-slate-500">{{ lang() === 'en' ? (p.translations.en?.description ?? p.description) : p.description }}</p>
          <p class="mt-4 text-2xl font-semibold">{{ monthly(p) | number: '1.2-2' }} MZN<span class="text-sm font-normal text-slate-500"> / {{ 'billing.month' | transloco }}</span></p>
          <ul class="mt-4 space-y-1 text-sm text-slate-600">
            <li>{{ 'billing.upToUsers' | transloco: { n: p.max_users ?? '∞' } }}</li>
            <li>{{ 'billing.upToBranches' | transloco: { n: p.max_branches ?? '∞' } }}</li>
            <li>{{ 'billing.upToDocs' | transloco: { n: p.max_documents ?? '∞' } }}</li>
          </ul>
          <button type="button" class="btn-secondary mt-auto" disabled [title]="'billing.checkoutSoon' | transloco">{{ 'billing.choose' | transloco }}</button>
        </article>
      }
    </div>
    <p class="mt-3 text-xs text-slate-500">{{ 'billing.checkoutSoon' | transloco }}</p>
  `,
})
export class BillingPage {
  protected readonly ctx = inject(ContextStore);
  private readonly sb = inject(Supabase);
  protected readonly plans = signal<Plan[]>([]);
  protected readonly usage = signal<Usage>({ users: 0, documents: 0, storage: 0 });
  protected readonly lang = () => (document.documentElement.lang.startsWith('en') ? 'en' : 'pt');
  protected readonly current = computed(() => this.plans().find((p) => p.slug === this.ctx.subscription()?.plan_slug) ?? null);

  constructor() {
    effect(() => { if (this.ctx.active()) void this.load(); });
  }

  protected monthly(p: Plan): number {
    return p.plan_prices.find((x) => x.period === 'monthly')?.amount ?? 0;
  }

  protected usageBars(p: Plan) {
    const u = this.usage();
    const gb = (b: number) => (b / 1024 ** 3).toFixed(2) + ' GB';
    const bar = (used: number, max: number | null, label: string) => ({ pct: max ? Math.min(100, (used / max) * 100) : 0, label });
    return [
      { key: 'users', ...bar(u.users, p.max_users, `${u.users} / ${p.max_users ?? '∞'}`) },
      { key: 'documents', ...bar(u.documents, p.max_documents, `${u.documents} / ${p.max_documents ?? '∞'}`) },
      { key: 'storage', ...bar(u.storage, p.max_storage_bytes, `${gb(u.storage)} / ${p.max_storage_bytes ? gb(p.max_storage_bytes) : '∞'}`) },
    ];
  }

  private async load(): Promise<void> {
    const ids = this.ctx.entities().map((e) => e.id);
    const [plans, docs, members] = await Promise.all([
      this.sb.client.from('plans').select('*, plan_prices(period, amount, currency)').eq('is_active', true).order('sort_order'),
      this.sb.client.from('documents').select('size_bytes').in('organization_id', ids).is('deleted_at', null),
      this.sb.client.from('memberships').select('user_id').in('org_id', ids),
    ]);
    this.plans.set((plans.data ?? []) as Plan[]);
    const d = (docs.data ?? []) as { size_bytes: number }[];
    this.usage.set({
      users: new Set(((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id)).size,
      documents: d.length, storage: d.reduce((a, x) => a + Number(x.size_bytes), 0),
    });
  }
}
