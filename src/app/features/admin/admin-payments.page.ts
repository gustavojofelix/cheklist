import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';

interface Pay { id: string; description: string; gateway: string; amount: number; currency: string; status: string; created_at: string;
                organizations: { name: string }; officegest_sync: { status: string; last_error: string | null; attempts: number } | null }
interface Inv { id: string; number: string; amount: number; currency: string; status: string; due_date: string; organizations: { name: string } }
interface Hook { id: string; provider: string; event_type: string | null; signature_valid: boolean; handled: boolean; error: string | null; received_at: string }

/** Back office: payments, pending bank-transfer invoices, Officegest sync and webhook log. */
@Component({
  selector: 'app-admin-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, DatePipe, DecimalPipe, PageHeader],
  template: `
    <app-page-header [title]="'admin.nav.payments' | transloco" [subtitle]="'admin.payments.subtitle' | transloco" />
    <section class="card mb-6 p-5">
      <h2 class="font-semibold">{{ 'admin.payments.pendingInvoices' | transloco }}</h2>
      <table class="table-base mt-3">
        <thead><tr><th>N.º</th><th>{{ 'admin.orgs.org' | transloco }}</th><th>{{ 'billing.amount' | transloco }}</th><th>{{ 'billing.due' | transloco }}</th><th></th></tr></thead>
        <tbody>
          @for (i of invoices(); track i.id) {
            <tr><td class="font-mono text-xs">{{ i.number }}</td><td>{{ i.organizations.name }}</td><td>{{ i.amount | number: '1.2-2' }} {{ i.currency }}</td>
              <td>{{ i.due_date | date: 'dd/MM/yyyy' }}</td>
              <td class="text-right"><button type="button" class="btn-primary !py-1" (click)="markPaid(i)">{{ 'admin.payments.markPaid' | transloco }}</button></td></tr>
          } @empty { <tr><td colspan="5" class="py-4 text-center text-slate-400">{{ 'admin.payments.noPending' | transloco }}</td></tr> }
        </tbody>
      </table>
    </section>
    <section class="card mb-6 overflow-x-auto p-5">
      <h2 class="font-semibold">{{ 'billing.payments' | transloco }}</h2>
      <table class="table-base mt-3">
        <thead><tr><th>{{ 'billing.date' | transloco }}</th><th>{{ 'admin.orgs.org' | transloco }}</th><th>{{ 'billing.description' | transloco }}</th>
          <th>{{ 'billing.amount' | transloco }}</th><th>{{ 'common.status' | transloco }}</th><th>Officegest</th></tr></thead>
        <tbody>
          @for (p of payments(); track p.id) {
            <tr><td class="text-slate-500">{{ p.created_at | date: 'dd/MM/yyyy HH:mm' }}</td><td>{{ p.organizations.name }}</td>
              <td>{{ p.description }}<span class="block text-xs text-slate-400">{{ 'billing.methods.' + p.gateway | transloco }}</span></td>
              <td>{{ p.amount | number: '1.2-2' }} {{ p.currency }}</td>
              <td><span class="chip bg-slate-100 text-slate-700">{{ 'billing.paymentStatus.' + p.status | transloco }}</span></td>
              <td class="text-xs">{{ p.officegest_sync?.status ?? '—' }} @if (p.officegest_sync?.last_error; as e) { <span class="block text-red-600">{{ e }}</span> }</td></tr>
          } @empty { <tr><td colspan="6" class="py-4 text-center text-slate-400">—</td></tr> }
        </tbody>
      </table>
    </section>
    <section class="card overflow-x-auto p-5">
      <h2 class="font-semibold">{{ 'admin.payments.webhooks' | transloco }}</h2>
      <table class="table-base mt-3">
        <thead><tr><th>{{ 'billing.date' | transloco }}</th><th>{{ 'admin.payments.provider' | transloco }}</th><th>{{ 'admin.payments.event' | transloco }}</th>
          <th>{{ 'admin.payments.signature' | transloco }}</th><th>{{ 'admin.payments.handled' | transloco }}</th></tr></thead>
        <tbody>
          @for (h of hooks(); track h.id) {
            <tr><td class="text-slate-500">{{ h.received_at | date: 'dd/MM/yyyy HH:mm:ss' }}</td><td>{{ h.provider }}</td><td class="font-mono text-xs">{{ h.event_type }}</td>
              <td>{{ h.signature_valid ? '✓' : '✗' }}</td><td>{{ h.handled ? '✓' : (h.error ?? '—') }}</td></tr>
          } @empty { <tr><td colspan="5" class="py-4 text-center text-slate-400">—</td></tr> }
        </tbody>
      </table>
    </section>
  `,
})
export class AdminPaymentsPage implements OnInit {
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly payments = signal<Pay[]>([]);
  protected readonly invoices = signal<Inv[]>([]);
  protected readonly hooks = signal<Hook[]>([]);

  async ngOnInit(): Promise<void> {
    const [p, i, h] = await Promise.all([
      this.sb.client.from('payments').select('id, description, gateway, amount, currency, status, created_at, organizations(name), officegest_sync(status, last_error, attempts)')
        .order('created_at', { ascending: false }).limit(100),
      this.sb.client.from('invoices').select('id, number, amount, currency, status, due_date, organizations(name)').eq('status', 'pending').order('created_at'),
      this.sb.client.from('webhook_events').select('id, provider, event_type, signature_valid, handled, error, received_at').order('received_at', { ascending: false }).limit(50),
    ]);
    this.payments.set((p.data ?? []) as unknown as Pay[]);
    this.invoices.set((i.data ?? []) as unknown as Inv[]);
    this.hooks.set((h.data ?? []) as Hook[]);
  }

  protected async markPaid(i: Inv): Promise<void> {
    if (!(await this.confirm.ask({ title: 'admin.payments.markPaidTitle', body: 'admin.payments.markPaidBody',
                                   params: { number: i.number, org: i.organizations.name } }))) return;
    try {
      await this.sb.rpc('admin_mark_invoice_paid', { p_invoice: i.id });
      this.toast.success('admin.payments.activated');
      await this.ngOnInit();
    } catch (e) { this.toast.error(errorKey(e)); }
  }
}
