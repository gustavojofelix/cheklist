import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';

interface Voucher { id: string; code: string; name: string; discount_type: 'percentage' | 'fixed'; discount_value: number;
                    plan_id: string | null; max_uses: number | null; uses_count: number; valid_from: string | null;
                    valid_until: string | null; is_active: boolean }

/** Back office: discount vouchers (redemption happens at checkout, iteration 6). */
@Component({
  selector: 'app-admin-vouchers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, DatePipe, PageHeader, Icon],
  template: `
    <app-page-header [title]="'admin.nav.vouchers' | transloco" [subtitle]="'admin.vouchers.subtitle' | transloco" />
    <form class="card mb-4 grid gap-3 p-4 sm:grid-cols-4" [formGroup]="form" (ngSubmit)="create()">
      <label class="text-xs text-slate-600">{{ 'admin.vouchers.code' | transloco }}<input class="input mt-1 font-mono uppercase" formControlName="code" placeholder="MOBILE2026" /></label>
      <label class="text-xs text-slate-600 sm:col-span-2">{{ 'common.name' | transloco }}<input class="input mt-1" formControlName="name" /></label>
      <label class="text-xs text-slate-600">{{ 'admin.plans.title' | transloco }}
        <select class="input mt-1" formControlName="plan_id"><option [ngValue]="null">{{ 'admin.vouchers.anyPlan' | transloco }}</option>
          @for (p of plans(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }</select></label>
      <label class="text-xs text-slate-600">{{ 'admin.vouchers.type' | transloco }}
        <select class="input mt-1" formControlName="discount_type"><option value="percentage">%</option><option value="fixed">MZN</option></select></label>
      <label class="text-xs text-slate-600">{{ 'admin.vouchers.value' | transloco }}<input type="number" min="0.01" step="0.01" class="input mt-1" formControlName="discount_value" /></label>
      <label class="text-xs text-slate-600">{{ 'admin.vouchers.maxUses' | transloco }}<input type="number" min="1" class="input mt-1" formControlName="max_uses" [placeholder]="'admin.plans.unlimited' | transloco" /></label>
      <label class="text-xs text-slate-600">{{ 'admin.vouchers.validUntil' | transloco }}<input type="date" class="input mt-1" formControlName="valid_until" /></label>
      <div class="sm:col-span-4 flex justify-end"><button class="btn-primary" type="submit" [disabled]="form.invalid"><app-icon name="plus" [size]="16" /> {{ 'common.create' | transloco }}</button></div>
    </form>
    <div class="card overflow-x-auto">
      <table class="table-base">
        <thead><tr><th>{{ 'admin.vouchers.code' | transloco }}</th><th>{{ 'common.name' | transloco }}</th><th>{{ 'admin.vouchers.value' | transloco }}</th>
          <th>{{ 'admin.vouchers.uses' | transloco }}</th><th>{{ 'admin.vouchers.validUntil' | transloco }}</th><th>{{ 'common.status' | transloco }}</th></tr></thead>
        <tbody>
          @for (v of vouchers(); track v.id) {
            <tr>
              <td class="font-mono">{{ v.code }}</td><td>{{ v.name }}</td>
              <td>{{ v.discount_value }}{{ v.discount_type === 'percentage' ? '%' : ' MZN' }}</td>
              <td>{{ v.uses_count }} / {{ v.max_uses ?? '∞' }}</td>
              <td>{{ v.valid_until ? (v.valid_until | date: 'dd/MM/yyyy') : '—' }}</td>
              <td><label class="flex items-center gap-1.5 text-sm"><input type="checkbox" [checked]="v.is_active" (change)="toggle(v, $any($event.target).checked)" />
                {{ (v.is_active ? 'admin.plans.active' : 'admin.vouchers.inactive') | transloco }}</label></td>
            </tr>
          } @empty { <tr><td colspan="6" class="py-8 text-center text-slate-600">{{ 'admin.vouchers.empty' | transloco }}</td></tr> }
        </tbody>
      </table>
    </div>
  `,
})
export class AdminVouchersPage implements OnInit {
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  protected readonly vouchers = signal<Voucher[]>([]);
  protected readonly plans = signal<{ id: string; name: string }[]>([]);
  protected readonly form = inject(FormBuilder).group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{3,32}$/)]],
    name: ['', Validators.required],
    plan_id: [null as string | null],
    discount_type: ['percentage' as 'percentage' | 'fixed', Validators.required],
    discount_value: [10, [Validators.required, Validators.min(0.01)]],
    max_uses: [null as number | null],
    valid_until: [null as string | null],
  });

  async ngOnInit(): Promise<void> {
    const [v, p] = await Promise.all([
      this.sb.client.from('vouchers').select('*').order('created_at', { ascending: false }),
      this.sb.client.from('plans').select('id, name').order('sort_order'),
    ]);
    this.vouchers.set((v.data ?? []) as Voucher[]);
    this.plans.set(p.data ?? []);
  }

  protected async create(): Promise<void> {
    const v = this.form.getRawValue();
    const { error } = await this.sb.client.from('vouchers').insert({ ...v, code: v.code!.toUpperCase(), valid_until: v.valid_until || null });
    if (error) { this.toast.error(errorKey(error)); return; }
    this.form.reset({ discount_type: 'percentage', discount_value: 10 });
    await this.ngOnInit();
  }

  protected async toggle(v: Voucher, on: boolean): Promise<void> {
    const { error } = await this.sb.client.from('vouchers').update({ is_active: on }).eq('id', v.id);
    if (error) this.toast.error(errorKey(error)); else await this.ngOnInit();
  }
}
