import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { LEGAL_ACT_KINDS, LegalActKind, LegalActRow } from './legislation.types';

/** Legislation library: each diploma with its original, linked alterations and revised text. */
@Component({
  selector: 'app-legislation-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, TranslocoPipe, Icon, PageHeader],
  template: `
    <app-page-header [title]="'legislation.title' | transloco" [subtitle]="'legislation.subtitle' | transloco">
      @if (canManage()) {
        <button type="button" class="btn-primary" (click)="creating.set(!creating())"><app-icon name="plus" [size]="16" /> {{ 'legislation.new' | transloco }}</button>
      }
    </app-page-header>

    @if (creating()) {
      <form class="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" (ngSubmit)="create()">
        <label class="text-sm sm:col-span-2">{{ 'legislation.field.title' | transloco }}<input class="input mt-1" name="title" [(ngModel)]="form.title" required /></label>
        <label class="text-sm">{{ 'legislation.field.reference' | transloco }}<input class="input mt-1" name="reference" [(ngModel)]="form.reference" placeholder="LACI047" /></label>
        <label class="text-sm">{{ 'legislation.field.area' | transloco }}<input class="input mt-1" name="area" [(ngModel)]="form.area" /></label>
        <label class="text-sm">{{ 'legislation.field.kind' | transloco }}
          <select class="input mt-1" name="kind" [(ngModel)]="form.kind">
            @for (k of kinds; track k) { <option [value]="k">{{ 'legislation.kind.' + k | transloco }}</option> }
          </select></label>
        <label class="text-sm">{{ 'legislation.field.number' | transloco }}<input class="input mt-1" name="number" [(ngModel)]="form.number" placeholder="38.088" /></label>
        <label class="text-sm">{{ 'legislation.field.date' | transloco }}<input class="input mt-1" type="date" name="date" [(ngModel)]="form.act_date" /></label>
        <div class="flex items-end"><button class="btn-primary w-full" type="submit" [disabled]="!form.title.trim() || busy()">{{ 'common.create' | transloco }}</button></div>
      </form>
    }

    <div class="card mb-4 p-3">
      <div class="relative">
        <span class="pointer-events-none absolute top-2.5 left-2.5 text-slate-600"><app-icon name="search" [size]="16" /></span>
        <input class="input !pl-8" [(ngModel)]="search" [placeholder]="'legislation.search' | transloco" [attr.aria-label]="'legislation.search' | transloco" />
      </div>
    </div>

    @if (loading()) {
      <p class="py-12 text-center text-slate-600">{{ 'common.loading' | transloco }}</p>
    } @else {
      <ul class="grid gap-4 md:grid-cols-2">
        @for (a of visible(); track a.id) {
          <li>
            <a class="card block h-full p-5 transition hover:border-brand-500 hover:shadow-md" [routerLink]="[a.id]">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  @if (a.reference) { <p class="font-mono text-xs text-brand-700">{{ a.reference }}</p> }
                  <h2 class="mt-0.5 text-lg font-semibold text-slate-900">{{ a.title }}</h2>
                  <p class="text-sm text-slate-600">{{ 'legislation.kind.' + a.kind | transloco }}@if (a.number) { n.º {{ a.number }}}@if (a.act_date) {, {{ 'legislation.of' | transloco }} {{ a.act_date | date: 'dd/MM/yyyy' }}}</p>
                </div>
                @if (a.area) { <span class="chip shrink-0 bg-sand-100 text-slate-700">{{ a.area }}</span> }
              </div>
              <!-- the pairing at a glance: original + alterations -> revised -->
              <div class="mt-4 flex flex-wrap items-center gap-1.5 text-xs font-semibold" [attr.aria-label]="'legislation.pairingLabel' | transloco">
                <span class="rounded-full px-2.5 py-1" [class]="count(a, 'original') ? 'bg-sun-100 text-sun-700' : 'bg-sand-100 text-slate-600'">{{ 'legislation.role.original' | transloco }}</span>
                <span class="text-slate-500" aria-hidden="true">+</span>
                <span class="rounded-full bg-brand-50 px-2.5 py-1 text-brand-800">{{ 'legislation.nAlterations' | transloco: { n: count(a, 'alteracao') } }}</span>
                <span class="text-slate-500" aria-hidden="true">→</span>
                <span class="rounded-full px-2.5 py-1" [class]="count(a, 'revisto') ? 'bg-brand-700 text-white' : 'bg-sand-100 text-slate-600'">{{ 'legislation.role.revisto' | transloco }}</span>
              </div>
            </a>
          </li>
        } @empty {
          <li class="card p-10 text-center text-slate-600 md:col-span-2">{{ 'legislation.empty' | transloco }}</li>
        }
      </ul>
    }
  `,
})
export class LegislationListPage {
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly ctx = inject(ContextStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly kinds = LEGAL_ACT_KINDS;
  protected readonly canManage = computed(() => this.ctx.isPlatform() && !!this.route.snapshot.data['admin']);
  protected readonly rows = signal<LegalActRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly creating = signal(false);
  protected readonly busy = signal(false);
  protected search = '';
  protected form = { title: '', reference: '', area: '', kind: 'decreto' as LegalActKind, number: '', act_date: '' };

  constructor() { void this.load(); }

  protected visible(): LegalActRow[] {
    const q = this.search.trim().toLowerCase();
    return this.rows().filter((a) => !q || [a.title, a.reference, a.number, a.area].some((v) => (v ?? '').toLowerCase().includes(q)));
  }
  protected count(a: LegalActRow, role: string): number { return a.legal_act_documents.filter((d) => d.role === role).length; }

  private async load(): Promise<void> {
    const { data, error } = await this.sb.client.from('legal_acts').select('*, legal_act_documents(role)').order('title');
    if (error) this.toast.error(errorKey(error));
    this.rows.set((data ?? []) as LegalActRow[]);
    this.loading.set(false);
  }

  protected async create(): Promise<void> {
    this.busy.set(true);
    const f = this.form;
    const { data, error } = await this.sb.client.from('legal_acts').insert({
      title: f.title.trim(), reference: f.reference.trim() || null, area: f.area.trim() || null, kind: f.kind,
      number: f.number.trim() || null, act_date: f.act_date || null,
    }).select('id').single();
    this.busy.set(false);
    if (error) { this.toast.error(errorKey(error)); return; }
    await this.router.navigate([data.id], { relativeTo: this.route });
  }
}
