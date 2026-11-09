import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { ReferenceService } from '../../core/reference.service';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/ui/icon';
import { OrgFields, orgForm } from '../../shared/ui/org-fields';
import { PageHeader } from '../../shared/ui/page-header';

interface AdminOrg {
  id: string; name: string; tax_id: string | null; sector: string | null; created_at: string;
  platform_access_authorized_at: string | null;
  subscriptions: { status: string; current_period_end: string; trial_ends_at: string | null; plans: { name: string } | null } | null;
  branches: { count: number }[];
}
interface Price { id: string; period: string; amount: number; currency: string; plans: { name: string; sort_order: number } }

/** Back office: customer accounts (metadata only — customer data needs consent + an operator session). */
@Component({
  selector: 'app-admin-organizations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, TranslocoPipe, DatePipe, PageHeader, Icon, OrgFields],
  template: `
    <app-page-header [title]="'admin.nav.organizations' | transloco" [subtitle]="'admin.orgs.subtitle' | transloco: { n: orgs().length }">
      @if (isSuper()) { <button type="button" class="btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="16" /> {{ 'admin.orgs.create' | transloco }}</button> }
    </app-page-header>
    <div class="mb-4 grid gap-4 sm:grid-cols-4">
      @for (k of kpis(); track k.key) {
        <div class="card p-4"><p class="text-sm text-slate-600">{{ 'admin.kpi.' + k.key | transloco }}</p><p class="mt-1 text-2xl font-semibold">{{ k.value }}</p></div>
      }
    </div>
    <div class="card p-4">
      <input class="input mb-3 max-w-sm" [(ngModel)]="q" [placeholder]="'admin.orgs.search' | transloco" [attr.aria-label]="'admin.orgs.search' | transloco" />
      <div class="overflow-x-auto">
        <table class="table-base">
          <thead><tr><th>{{ 'admin.orgs.org' | transloco }}</th><th>NUIT</th><th>{{ 'admin.orgs.plan' | transloco }}</th>
            <th>{{ 'common.status' | transloco }}</th><th>{{ 'admin.orgs.branches' | transloco }}</th><th>{{ 'admin.orgs.access' | transloco }}</th><th>{{ 'admin.orgs.created' | transloco }}</th><th></th></tr></thead>
          <tbody>
            @for (o of filtered(); track o.id) {
              <tr>
                <td class="font-medium">{{ o.name }}<span class="block text-xs font-normal text-slate-600">{{ refs.label('sector', o.sector) }}</span></td>
                <td class="font-mono text-xs">{{ o.tax_id || '—' }}</td>
                <td>{{ o.subscriptions?.plans?.name ?? '—' }}</td>
                <td>@if (o.subscriptions; as s) { <span class="chip bg-slate-100 text-slate-700">{{ 'billing.status.' + s.status | transloco }}</span> }</td>
                <td>{{ o.branches[0]?.count ?? 0 }}</td>
                <td>@if (o.platform_access_authorized_at) { <span class="chip bg-emerald-100 text-emerald-800">{{ 'admin.orgs.authorized' | transloco }}</span> }
                    @else { <span class="chip bg-slate-100 text-slate-600">{{ 'admin.orgs.notAuthorized' | transloco }}</span> }</td>
                <td class="text-slate-600">{{ o.created_at | date: 'dd/MM/yyyy' }}</td>
                <td class="whitespace-nowrap text-right">
                  @if (isSuper()) { <button type="button" class="btn-ghost !py-1" (click)="openPlan(o)">{{ 'admin.orgs.assignPlan' | transloco }}</button> }
                  <button type="button" class="btn-secondary !py-1" [disabled]="!o.platform_access_authorized_at" (click)="enter(o)"
                          [title]="o.platform_access_authorized_at ? '' : ('admin.orgs.noConsent' | transloco)">{{ 'admin.orgs.enter' | transloco }}</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="py-8 text-center text-slate-600">{{ 'common.loading' | transloco }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-slate-600">{{ 'admin.orgs.consentNote' | transloco }}</p>
    </div>

    <ng-template #planDialog>
      <div class="w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-white p-6 shadow-xl">
        <h2 class="text-lg font-semibold">{{ 'admin.orgs.assignPlanTitle' | transloco: { name: target()?.name } }}</h2>
        <p class="mt-1 text-sm text-slate-600">{{ 'admin.orgs.assignPlanHint' | transloco }}</p>
        <select class="input mt-4" [(ngModel)]="priceId" [attr.aria-label]="'admin.orgs.plan' | transloco">
          @for (p of prices(); track p.id) { <option [value]="p.id">{{ p.plans.name }} — {{ 'admin.period.' + p.period | transloco }} — {{ p.amount }} {{ p.currency }}</option> }
        </select>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="btn-secondary" (click)="ref?.close()">{{ 'common.cancel' | transloco }}</button>
          <button type="button" class="btn-primary" [disabled]="!priceId" (click)="assign()">{{ 'common.confirm' | transloco }}</button>
        </div>
      </div>
    </ng-template>

    <ng-template #createDialog>
      <form class="max-h-[90vh] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-white p-6 shadow-xl" [formGroup]="create" (ngSubmit)="submitCreate()">
        <h2 class="text-lg font-semibold">{{ 'admin.orgs.create' | transloco }}</h2>
        <p class="mt-1 mb-4 text-sm text-slate-600">{{ 'admin.orgs.createHint' | transloco }}</p>
        <app-org-fields [form]="create" />
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <label class="text-sm">{{ 'admin.orgs.adminName' | transloco }}<input class="input mt-1" [formControl]="adminName" /></label>
          <label class="text-sm">{{ 'admin.orgs.adminEmail' | transloco }}<input type="email" class="input mt-1" [formControl]="adminEmail" /></label>
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="btn-secondary" (click)="ref?.close()">{{ 'common.cancel' | transloco }}</button>
          <button type="submit" class="btn-primary" [disabled]="busy() || create.invalid || adminEmail.invalid">{{ 'common.create' | transloco }}</button>
        </div>
      </form>
    </ng-template>
  `,
})
export class AdminOrganizationsPage implements OnInit {
  private readonly sb = inject(Supabase);
  private readonly ctx = inject(ContextStore);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly t = inject(TranslocoService);
  protected readonly refs = inject(ReferenceService);
  private readonly planTpl = viewChild.required<TemplateRef<unknown>>('planDialog');
  private readonly createTpl = viewChild.required<TemplateRef<unknown>>('createDialog');
  protected ref: DialogRef | null = null;

  protected readonly orgs = signal<AdminOrg[]>([]);
  protected readonly prices = signal<Price[]>([]);
  protected readonly target = signal<AdminOrg | null>(null);
  protected readonly busy = signal(false);
  protected readonly isSuper = computed(() => this.ctx.profile()?.platform_role === 'superadmin');
  protected q = '';
  protected priceId = '';
  protected readonly create = orgForm(this.fb);
  protected readonly adminName = this.fb.nonNullable.control('', Validators.required);
  protected readonly adminEmail = this.fb.nonNullable.control('', [Validators.required, Validators.email]);

  protected readonly kpis = computed(() => {
    const o = this.orgs();
    const st = (s: string) => o.filter((x) => x.subscriptions?.status === s).length;
    return [
      { key: 'customers', value: o.length }, { key: 'active', value: st('active') },
      { key: 'trial', value: st('trial') }, { key: 'expired', value: st('expired') + st('canceled') },
    ];
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    const { data } = await this.sb.client.from('organizations')
      .select('id, name, tax_id, sector, created_at, platform_access_authorized_at, subscriptions(status, current_period_end, trial_ends_at, plans(name)), branches:organizations!parent_id(count)')
      .is('parent_id', null).is('deleted_at', null).order('created_at', { ascending: false });
    this.orgs.set((data ?? []) as unknown as AdminOrg[]);
  }

  protected filtered(): AdminOrg[] {
    const q = this.q.trim().toLowerCase();
    return q ? this.orgs().filter((o) => o.name.toLowerCase().includes(q) || (o.tax_id ?? '').includes(q)) : this.orgs();
  }

  protected async openPlan(o: AdminOrg): Promise<void> {
    this.target.set(o);
    if (!this.prices().length) {
      const { data } = await this.sb.client.from('plan_prices').select('id, period, amount, currency, plans(name, sort_order)').eq('is_active', true);
      this.prices.set(((data ?? []) as unknown as Price[]).sort((a, b) => a.plans.sort_order - b.plans.sort_order || a.amount - b.amount));
    }
    this.priceId = '';
    this.ref = this.dialog.open(this.planTpl());
  }

  protected async assign(): Promise<void> {
    try {
      await this.sb.rpc('admin_assign_plan', { org: this.target()!.id, p_price: this.priceId });
      this.ref?.close();
      this.toast.success('common.saved');
      await this.load();
    } catch (e) { this.toast.error(errorKey(e)); }
  }

  protected async enter(o: AdminOrg): Promise<void> {
    const reason = prompt(`${o.name}\n\n${this.t.translate('admin.orgs.reasonPrompt')}`);
    if (!reason?.trim()) return;
    try {
      await this.sb.rpc('operator_access_start', { org: o.id, reason });
      await this.ctx.load();
      this.ctx.setActive(o.id);
      await this.router.navigateByUrl('/dashboard');
    } catch (e) { this.toast.error(errorKey(e)); }
  }

  protected openCreate(): void {
    this.create.reset({ type: 'commercial', country: 'MZ' });
    this.adminName.reset();
    this.adminEmail.reset();
    this.ref = this.dialog.open(this.createTpl());
  }

  protected async submitCreate(): Promise<void> {
    this.busy.set(true);
    try {
      await this.sb.fn('admin-create-company', {
        organization: this.create.getRawValue(), admin_name: this.adminName.value, admin_email: this.adminEmail.value });
      this.ref?.close();
      this.toast.success('admin.orgs.created');
      await this.load();
    } catch (e) { this.toast.error(errorKey(e)); } finally { this.busy.set(false); }
  }
}
