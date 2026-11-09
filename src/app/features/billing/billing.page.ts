import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';

interface Price { id: string; period: string; amount: number; currency: string; is_active: boolean }
interface Plan { id: string; slug: string; name: string; description: string; translations: { en?: { name?: string; description?: string } };
                 max_users: number | null; max_branches: number | null; max_documents: number | null; max_storage_bytes: number | null;
                 plan_prices: Price[] }
interface Usage { users: number; documents: number; storage: number }
interface Quote { amount: number; original: number; discount: number; currency: string; voucher_valid: boolean | null }
interface Invoice { id: string; number: string; amount: number; currency: string; status: string; due_date: string; bank_details: string; created_at: string }
interface Payment { id: string; description: string; gateway: string; amount: number; currency: string; status: string; created_at: string; paid_at: string | null }
type Method = 'stripe' | 'sislog' | 'manual';
interface Purchase { price?: Price; plan?: Plan; addon?: 'storage_5gb' }

@Component({
  selector: 'app-billing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, DatePipe, DecimalPipe, PageHeader],
  template: `
    <app-page-header [title]="'nav.billing' | transloco" [subtitle]="'billing.subtitle' | transloco" />

    @if (ctx.subscription(); as s) {
      <section class="card p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm text-slate-500">{{ 'billing.currentPlan' | transloco }}</p>
            <p class="text-xl font-semibold">{{ s.plan }} <span class="chip ml-2 bg-brand-100 text-brand-700">{{ 'billing.status.' + s.status | transloco }}</span></p>
          </div>
          <div class="text-right text-sm text-slate-500">
            {{ (s.status === 'trial' ? 'billing.trialEnds' : 'billing.periodEnds') | transloco }}
            <strong>{{ (s.trial_ends_at ?? s.current_period_end) | date: 'dd/MM/yyyy' }}</strong>
            @if (s.status === 'active' || s.status === 'past_due') {
              <button type="button" class="btn-ghost ml-2 !py-1 text-red-600" (click)="cancel()">{{ 'billing.cancel' | transloco }}</button>
            }
          </div>
        </div>
        @if (current(); as p) {
          <div class="mt-5 grid gap-4 sm:grid-cols-3">
            @for (u of usageBars(p); track u.key) {
              <div>
                <div class="flex justify-between text-sm"><span>{{ 'billing.usage.' + u.key | transloco }}</span><span class="text-slate-500">{{ u.label }}</span></div>
                <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div class="h-full rounded-full" [class]="u.pct >= 95 ? 'bg-red-500' : u.pct >= 80 ? 'bg-amber-500' : 'bg-brand-500'" [style.width.%]="u.pct"></div>
                </div>
              </div>
            }
          </div>
          <p class="mt-3 text-xs text-slate-500">{{ 'billing.recycledNote' | transloco }}</p>
          @if (s.plan_slug !== 'trial') {
            <button type="button" class="btn-secondary mt-3 !py-1" (click)="buy({ addon: 'storage_5gb' })">{{ 'billing.addStorage' | transloco }}</button>
          }
        }
      </section>
    }

    <!-- checkout panel -->
    @if (purchase(); as pu) {
      <section class="card mt-6 border-brand-200 p-5 ring-2 ring-brand-100">
        <h2 class="font-semibold">{{ 'billing.checkout' | transloco }}: {{ pu.addon ? ('billing.addStorage' | transloco) : planName(pu.plan!) + ' — ' + ('admin.period.' + pu.price!.period | transloco) }}</h2>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label class="label" for="voucher">{{ 'billing.voucher' | transloco }}</label>
            <div class="flex gap-2">
              <input id="voucher" class="input font-mono uppercase" [(ngModel)]="voucher" />
              <button type="button" class="btn-secondary" (click)="requote()">{{ 'billing.apply' | transloco }}</button>
            </div>
            @if (quote()?.voucher_valid === false) { <p class="field-error">{{ 'billing.invalidVoucher' | transloco }}</p> }
            @if (quote(); as q) {
              <p class="mt-3 text-2xl font-semibold">{{ q.amount | number: '1.2-2' }} {{ q.currency }}
                @if (q.discount > 0) { <span class="ml-2 text-sm font-normal text-slate-500 line-through">{{ q.original | number: '1.2-2' }}</span> }</p>
            }
          </div>
          <fieldset>
            <legend class="label">{{ 'billing.method' | transloco }}</legend>
            @for (m of methods; track m) {
              <label class="mb-2 flex items-start gap-2 rounded-lg border p-3 text-sm" [class.opacity-50]="m === 'sislog'"
                     [class]="method() === m ? 'border-brand-500 bg-brand-50' : 'border-slate-200'">
                <input type="radio" name="method" [value]="m" [checked]="method() === m" [disabled]="m === 'sislog'" (change)="method.set(m)" class="mt-0.5" />
                <span><strong>{{ 'billing.methods.' + m | transloco }}</strong><span class="block text-xs text-slate-500">{{ 'billing.methods.' + m + 'Hint' | transloco }}</span></span>
              </label>
            }
          </fieldset>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-secondary" (click)="purchase.set(null)">{{ 'common.cancel' | transloco }}</button>
          <button type="button" class="btn-primary" [disabled]="busy() || !quote()" (click)="pay()">{{ (busy() ? 'common.wait' : 'billing.proceed') | transloco }}</button>
        </div>
      </section>
    }

    @if (invoice(); as inv) {
      <section class="card mt-6 border-amber-200 bg-amber-50 p-5 text-sm">
        <h2 class="font-semibold text-amber-900">{{ 'billing.invoiceCreated' | transloco: { number: inv.number } }}</h2>
        <p class="mt-1">{{ 'billing.invoiceHint' | transloco: { amount: (inv.amount | number: '1.2-2'), currency: inv.currency, due: (inv.due_date | date: 'dd/MM/yyyy') } }}</p>
        <pre class="mt-3 whitespace-pre-wrap rounded bg-white p-3 text-xs">{{ inv.bank_details }}</pre>
      </section>
    }

    <h2 class="mt-8 mb-3 flex flex-wrap items-center justify-between gap-2 font-semibold">{{ 'billing.plans' | transloco }}
      <span class="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm font-normal">
        @for (p of periods; track p) {
          <button type="button" class="rounded-md px-3 py-1" [class]="period() === p ? 'bg-brand-600 text-white' : 'text-slate-600'" (click)="period.set(p)">
            {{ 'admin.period.' + p | transloco }}</button>
        }
      </span>
    </h2>
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      @for (p of plans(); track p.id) {
        @let pr = priceFor(p);
        <article class="card flex flex-col p-5" [class.ring-2]="p.slug === ctx.subscription()?.plan_slug" [class.ring-brand-500]="p.slug === ctx.subscription()?.plan_slug">
          <h3 class="font-semibold">{{ planName(p) }}</h3>
          <p class="mt-1 text-sm text-slate-500">{{ lang() === 'en' ? (p.translations.en?.description ?? p.description) : p.description }}</p>
          <p class="mt-4 text-2xl font-semibold">
            @if (pr) { {{ pr.amount | number: '1.2-2' }} MZN<span class="text-sm font-normal text-slate-500"> / {{ 'admin.period.' + pr.period | transloco }}</span> }
            @else { <span class="text-base font-normal text-slate-500">{{ 'billing.notInPeriod' | transloco }}</span> }
          </p>
          <ul class="mt-4 space-y-1 text-sm text-slate-600">
            <li>{{ 'billing.upToUsers' | transloco: { n: p.max_users ?? '∞' } }}</li>
            <li>{{ 'billing.upToBranches' | transloco: { n: p.max_branches ?? '∞' } }}</li>
            <li>{{ 'billing.upToDocs' | transloco: { n: p.max_documents ?? '∞' } }}</li>
          </ul>
          <button type="button" class="btn-primary mt-auto" [disabled]="!pr || pr.amount === 0" (click)="buy({ plan: p, price: pr! })">{{ 'billing.choose' | transloco }}</button>
        </article>
      }
    </div>

    <div class="mt-8 grid gap-6 lg:grid-cols-2">
      <section class="card p-5">
        <h2 class="font-semibold">{{ 'billing.invoices' | transloco }}</h2>
        <table class="table-base mt-3">
          <thead><tr><th>N.º</th><th>{{ 'billing.amount' | transloco }}</th><th>{{ 'billing.due' | transloco }}</th><th>{{ 'common.status' | transloco }}</th></tr></thead>
          <tbody>
            @for (i of invoices(); track i.id) {
              <tr><td class="font-mono text-xs">{{ i.number }}</td><td>{{ i.amount | number: '1.2-2' }} {{ i.currency }}</td>
                <td>{{ i.due_date | date: 'dd/MM/yyyy' }}</td><td><span class="chip bg-slate-100 text-slate-700">{{ 'billing.invoiceStatus.' + i.status | transloco }}</span></td></tr>
            } @empty { <tr><td colspan="4" class="py-4 text-center text-slate-500">—</td></tr> }
          </tbody>
        </table>
      </section>
      <section class="card p-5">
        <h2 class="font-semibold">{{ 'billing.payments' | transloco }}</h2>
        <table class="table-base mt-3">
          <thead><tr><th>{{ 'billing.date' | transloco }}</th><th>{{ 'billing.description' | transloco }}</th><th>{{ 'billing.amount' | transloco }}</th><th>{{ 'common.status' | transloco }}</th></tr></thead>
          <tbody>
            @for (p of payments(); track p.id) {
              <tr><td class="text-slate-500">{{ p.created_at | date: 'dd/MM/yyyy' }}</td><td>{{ p.description }}<span class="block text-xs text-slate-500">{{ 'billing.methods.' + p.gateway | transloco }}</span></td>
                <td>{{ p.amount | number: '1.2-2' }} {{ p.currency }}</td><td><span class="chip bg-slate-100 text-slate-700">{{ 'billing.paymentStatus.' + p.status | transloco }}</span></td></tr>
            } @empty { <tr><td colspan="4" class="py-4 text-center text-slate-500">—</td></tr> }
          </tbody>
        </table>
      </section>
    </div>
  `,
})
export class BillingPage {
  readonly paid = input<string>();
  protected readonly ctx = inject(ContextStore);
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly t = inject(TranslocoService);
  protected readonly lang = toSignal(this.t.langChanges$, { initialValue: this.t.getActiveLang() });
  protected readonly periods = ['monthly', 'semestral', 'annual'];
  protected readonly methods: Method[] = ['stripe', 'sislog', 'manual'];
  protected readonly period = signal('monthly');
  protected readonly plans = signal<Plan[]>([]);
  protected readonly usage = signal<Usage>({ users: 0, documents: 0, storage: 0 });
  protected readonly invoices = signal<Invoice[]>([]);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly purchase = signal<Purchase | null>(null);
  protected readonly quote = signal<Quote | null>(null);
  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly method = signal<Method>('stripe');
  protected readonly busy = signal(false);
  protected voucher = '';
  protected readonly current = computed(() => this.plans().find((p) => p.slug === this.ctx.subscription()?.plan_slug) ?? null);

  constructor() {
    effect(() => { if (this.ctx.active()) void this.load(); });
    effect(() => {
      if (this.paid()) {
        this.toast.success('billing.paidToast');
        void this.ctx.load();
      }
    });
  }

  protected planName(p: Plan): string { return this.lang() === 'en' ? (p.translations.en?.name ?? p.name) : p.name; }
  protected priceFor(p: Plan): Price | undefined { return p.plan_prices.find((x) => x.period === this.period() && x.is_active); }

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
    const root = this.ctx.active()!.id;
    const [plans, docs, members, inv, pay] = await Promise.all([
      this.sb.client.from('plans').select('*, plan_prices(id, period, amount, currency, is_active)').eq('is_active', true).order('sort_order'),
      this.sb.client.from('documents').select('size_bytes').in('organization_id', ids).is('deleted_at', null),
      this.sb.client.from('memberships').select('user_id').in('org_id', ids),
      this.sb.client.from('invoices').select('id, number, amount, currency, status, due_date, bank_details, created_at').eq('organization_id', root).order('created_at', { ascending: false }),
      this.sb.client.from('payments').select('id, description, gateway, amount, currency, status, created_at, paid_at').eq('organization_id', root).order('created_at', { ascending: false }).limit(20),
    ]);
    this.plans.set((plans.data ?? []) as Plan[]);
    const d = (docs.data ?? []) as { size_bytes: number }[];
    this.usage.set({ users: new Set(((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id)).size,
                     documents: d.length, storage: d.reduce((a, x) => a + Number(x.size_bytes), 0) });
    this.invoices.set((inv.data ?? []) as Invoice[]);
    this.payments.set((pay.data ?? []) as Payment[]);
  }

  protected async buy(p: Purchase): Promise<void> {
    this.purchase.set(p);
    this.invoice.set(null);
    this.voucher = '';
    await this.requote();
  }

  protected async requote(): Promise<void> {
    const p = this.purchase();
    if (!p) return;
    try {
      this.quote.set(await this.sb.rpc<Quote>('checkout_quote', { org: this.ctx.active()!.id, p_price: p.price?.id ?? null,
        p_addon: p.addon ?? null, p_voucher: this.voucher.trim() || null }));
    } catch (e) { this.toast.error(errorKey(e)); }
  }

  protected async pay(): Promise<void> {
    const p = this.purchase()!;
    this.busy.set(true);
    try {
      const res = await this.sb.fn<{ status: string; url?: string; invoice?: Invoice }>('checkout-create', {
        org: this.ctx.active()!.id, plan_price_id: p.price?.id ?? null, addon: p.addon ?? null,
        voucher: this.voucher.trim() || null, method: this.method() });
      if (res.status === 'redirect' && res.url) { window.location.href = res.url; return; }
      if (res.status === 'invoice' && res.invoice) this.invoice.set(res.invoice);
      if (res.status === 'paid') { this.toast.success('billing.paidToast'); await this.ctx.load(); }
      this.purchase.set(null);
      await this.load();
    } catch (e) {
      this.toast.error(errorKey(e));
    } finally { this.busy.set(false); }
  }

  protected async cancel(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'billing.cancelTitle', body: 'billing.cancelBody', danger: true, confirm: 'billing.cancel' }))) return;
    try {
      await this.sb.rpc('cancel_subscription', { org: this.ctx.active()!.id });
      await this.ctx.load();
      this.toast.success('billing.canceled');
    } catch (e) { this.toast.error(errorKey(e)); }
  }
}
