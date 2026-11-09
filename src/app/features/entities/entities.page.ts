import { ChangeDetectionStrategy, Component, TemplateRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { ReferenceService } from '../../core/reference.service';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { errorOf, nuit, phone9 } from '../../shared/validators';

interface EntityCard {
  id: string; name: string; parent_id: string | null; entity_subtype: string | null; tax_id: string | null;
  province: string | null; stats: { total: number; regular: number; atencao: number; critico: number };
}

@Component({
  selector: 'app-entities',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, TranslocoPipe, PageHeader, Icon],
  template: `
    <app-page-header [title]="'nav.entities' | transloco" [subtitle]="'entities.subtitle' | transloco: { name: ctx.active()?.name }">
      @if (ctx.canWrite('admin')) {
        <button type="button" class="btn-primary" (click)="openBranch()" [disabled]="!canAddBranch()"
                [title]="canAddBranch() ? '' : ('errors.quota.branches' | transloco)">
          <app-icon name="plus" [size]="16" /> {{ 'entities.addBranch' | transloco }}</button>
      }
    </app-page-header>

    <p class="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{{ 'entities.singleParent' | transloco }}</p>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      @for (e of cards(); track e.id) {
        <article class="card flex flex-col p-5">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            {{ (e.parent_id ? 'entities.branch' : 'entities.parent') | transloco }} · {{ refs.label('entity_subtype', e.entity_subtype) }}
          </p>
          <h2 class="mt-1 text-lg font-semibold text-slate-900">{{ e.name }}</h2>
          <p class="text-sm text-slate-600">NUIT {{ e.tax_id || '—' }} · {{ e.province || '—' }}</p>
          <div class="mt-4 grid grid-cols-4 gap-2 text-center">
            <div class="rounded-lg bg-slate-50 p-2"><p class="text-lg font-semibold">{{ e.stats.total }}</p><p class="text-[11px] text-slate-600">{{ 'entities.items' | transloco }}</p></div>
            <div class="rounded-lg bg-emerald-50 p-2"><p class="text-lg font-semibold text-emerald-700">{{ e.stats.regular }}</p><p class="text-[11px] text-emerald-700">{{ 'compliance.regular' | transloco }}</p></div>
            <div class="rounded-lg bg-amber-50 p-2"><p class="text-lg font-semibold text-amber-700">{{ e.stats.atencao }}</p><p class="text-[11px] text-amber-700">{{ 'compliance.atencao' | transloco }}</p></div>
            <div class="rounded-lg bg-red-50 p-2"><p class="text-lg font-semibold text-red-700">{{ e.stats.critico }}</p><p class="text-[11px] text-red-700">{{ 'compliance.critico' | transloco }}</p></div>
          </div>
          <div class="mt-5 flex gap-2">
            <a class="btn-primary flex-1" [routerLink]="['/entities', e.id, 'ficha']">{{ 'entities.open' | transloco }}</a>
            @if (e.parent_id && ctx.canWrite('admin')) {
              <button type="button" class="btn-secondary" (click)="removeBranch(e)" [attr.aria-label]="'entities.deleteBranch' | transloco"><app-icon name="trash" [size]="16" /></button>
            }
          </div>
        </article>
      }
    </div>

    <ng-template #branchDialog>
      <form class="w-[min(36rem,calc(100vw-2rem))] rounded-xl bg-white p-6 shadow-xl" [formGroup]="branch" (ngSubmit)="createBranch()" novalidate>
        <h2 class="text-lg font-semibold">{{ 'entities.addBranch' | transloco }}</h2>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2"><label class="label" for="b-name">{{ 'org.name' | transloco }} *</label><input id="b-name" class="input" formControlName="name" />
            @if (err('name'); as k) { <p class="field-error">{{ k | transloco }}</p> }</div>
          <div><label class="label" for="b-nuit">NUIT</label><input id="b-nuit" class="input" formControlName="tax_id" maxlength="9" />
            @if (err('tax_id'); as k) { <p class="field-error">{{ k | transloco }}</p> }</div>
          <div><label class="label" for="b-phone">{{ 'org.phone' | transloco }}</label><input id="b-phone" class="input" formControlName="phone" maxlength="9" />
            @if (err('phone'); as k) { <p class="field-error">{{ k | transloco }}</p> }</div>
          <div><label class="label" for="b-email">{{ 'org.email' | transloco }}</label><input id="b-email" type="email" class="input" formControlName="email" /></div>
          <div><label class="label" for="b-prov">{{ 'org.province' | transloco }}</label>
            <select id="b-prov" class="input" formControlName="province"><option value="">{{ 'common.select' | transloco }}</option>
              @for (o of refs.options('province'); track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
          <div class="sm:col-span-2"><label class="label" for="b-addr">{{ 'org.address' | transloco }}</label><input id="b-addr" class="input" formControlName="address" /></div>
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="btn-secondary" (click)="dialogRef?.close()">{{ 'common.cancel' | transloco }}</button>
          <button type="submit" class="btn-primary" [disabled]="busy()">{{ 'common.create' | transloco }}</button>
        </div>
      </form>
    </ng-template>
  `,
})
export class EntitiesPage {
  protected readonly ctx = inject(ContextStore);
  protected readonly refs = inject(ReferenceService);
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly confirm = inject(ConfirmService);
  private readonly tpl = viewChild.required<TemplateRef<unknown>>('branchDialog');
  protected dialogRef: DialogRef | null = null;

  protected readonly cards = signal<EntityCard[]>([]);
  protected readonly maxBranches = signal<number | null>(0);
  protected readonly busy = signal(false);
  protected readonly canAddBranch = computed(() => {
    const max = this.maxBranches();
    return max === null || this.cards().filter((c) => c.parent_id).length < max;
  });
  protected readonly branch = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required], tax_id: ['', nuit], phone: ['', phone9], email: ['', Validators.email],
    province: [''], address: [''],
  });

  constructor() {
    effect(() => { const a = this.ctx.active(); if (a) void this.load(a.id); });
  }

  protected err(n: string): string | null { return errorOf(this.branch.get(n)); }

  private async load(rootId: string): Promise<void> {
    const [orgs, items, sub] = await Promise.all([
      this.sb.client.from('organizations').select('id, name, parent_id, entity_subtype, tax_id, province')
        .or(`id.eq.${rootId},parent_id.eq.${rootId}`).is('deleted_at', null).order('parent_id', { nullsFirst: true }).order('name'),
      this.sb.client.from('checklist_items_state').select('organization_id, compliance_state').eq('is_category', false),
      this.sb.client.from('subscriptions').select('plans(max_branches), extra_branches').eq('organization_id', rootId).maybeSingle(),
    ]);
    const stats = new Map<string, EntityCard['stats']>();
    for (const i of (items.data ?? []) as { organization_id: string; compliance_state: 'regular' | 'atencao' | 'critico' }[]) {
      const s = stats.get(i.organization_id) ?? { total: 0, regular: 0, atencao: 0, critico: 0 };
      s.total++; s[i.compliance_state]++;
      stats.set(i.organization_id, s);
    }
    this.cards.set(((orgs.data ?? []) as Omit<EntityCard, 'stats'>[]).map((o) => ({
      ...o, stats: stats.get(o.id) ?? { total: 0, regular: 0, atencao: 0, critico: 0 } })));
    const s = sub.data as { plans: { max_branches: number | null } | null; extra_branches: number } | null;
    this.maxBranches.set(s?.plans ? (s.plans.max_branches === null ? null : s.plans.max_branches + s.extra_branches) : 0);
  }

  protected openBranch(): void {
    this.branch.reset();
    this.dialogRef = this.dialog.open(this.tpl());
  }

  protected async createBranch(): Promise<void> {
    this.branch.markAllAsTouched();
    if (this.branch.invalid) return;
    this.busy.set(true);
    try {
      await this.sb.rpc('create_branch', { parent: this.ctx.active()!.id, payload: this.branch.getRawValue() });
      this.dialogRef?.close();
      this.toast.success('entities.branchCreated');
      await this.ctx.load();
      await this.load(this.ctx.active()!.id);
    } catch (e) {
      this.toast.error(errorKey(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async removeBranch(e: EntityCard): Promise<void> {
    if (!(await this.confirm.ask({ title: 'entities.deleteBranch', body: 'entities.deleteBranchBody', danger: true,
                                   confirm: 'common.delete', params: { name: e.name } }))) return;
    try {
      await this.sb.rpc('delete_branch', { branch: e.id });
      await this.ctx.load();
      await this.load(this.ctx.active()!.id);
    } catch (err) {
      this.toast.error(errorKey(err));
    }
  }
}
