import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { LegalDocumentDialog, LegalDocumentDialogData } from './legal-document.dialog';
import { LegalAct, LegalDocument, pairing } from './legislation.types';

/**
 * One diploma and its "acasalamento": the original publication, the diplomas that amend it
 * (oldest first, each tied to the original) and the revised text that results from them.
 */
@Component({
  selector: 'app-legislation-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, RouterLink, TranslocoPipe, Icon],
  template: `
    <nav class="mb-2 text-sm text-slate-600"><a [routerLink]="['..']" class="hover:underline">{{ 'legislation.title' | transloco }}</a>
      @if (act(); as a) { / {{ a.reference ?? a.title }} }</nav>

    @if (act(); as a) {
      <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold text-slate-900">{{ a.title }}</h1>
          <p class="mt-1 text-sm text-slate-600">{{ 'legislation.kind.' + a.kind | transloco }}@if (a.number) { n.º {{ a.number }}}@if (a.act_date) {, {{ 'legislation.of' | transloco }} {{ a.act_date | date: 'dd/MM/yyyy' }}}
            @if (a.area) { · {{ a.area }} }</p>
          <div class="mz-rule" aria-hidden="true"><span></span><span></span><span></span></div>
        </div>
        @if (canManage()) {
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary text-red-700" (click)="removeAct()"><app-icon name="trash" [size]="16" /> {{ 'legislation.removeAct' | transloco }}</button>
            <button type="button" class="btn-primary" (click)="add()"><app-icon name="plus" [size]="16" /> {{ 'legislation.addDocument' | transloco }}</button>
          </div>
        }
      </div>
      @if (a.summary) { <p class="mb-4 max-w-3xl text-sm text-slate-700">{{ a.summary }}</p> }

      <!-- the pairing in one line -->
      <section class="card mb-6 p-4" [attr.aria-label]="'legislation.pairingLabel' | transloco">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600">{{ 'legislation.pairing' | transloco }}</h2>
        <div class="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span class="rounded-lg px-3 py-1.5" [class]="pair().original ? 'bg-sun-100 text-sun-700' : 'bg-sand-100 text-slate-600'">
            {{ 'legislation.role.original' | transloco }}</span>
          @for (d of pair().alterations; track d.id; let i = $index) {
            <span class="text-slate-500" aria-hidden="true">+</span>
            <span class="rounded-lg bg-brand-50 px-3 py-1.5 text-brand-800">{{ 'legislation.alterationN' | transloco: { n: i + 1 } }}</span>
          }
          <span class="text-lg text-slate-500" aria-hidden="true">→</span>
          <span class="rounded-lg px-3 py-1.5" [class]="pair().revised ? 'bg-brand-700 text-white' : 'border border-dashed border-slate-400 text-slate-600'">
            {{ 'legislation.role.revisto' | transloco }}</span>
        </div>
        <p class="mt-3 text-xs text-slate-600">{{ 'legislation.pairingHint' | transloco }}</p>
      </section>

      <ol class="space-y-4" [attr.aria-label]="'legislation.chain' | transloco">
        <!-- original -->
        <li class="relative pl-12">
          <span class="absolute top-10 bottom-[-1rem] left-[1.2rem] w-0.5 bg-brand-200" aria-hidden="true"></span>
          <span class="absolute top-2 left-0 grid size-10 place-items-center" aria-hidden="true">
            <span class="size-7 rotate-45 rounded-sm bg-sun-400 ring-4 ring-sand-50"></span><span class="absolute size-3 rotate-45 bg-ink"></span>
          </span>
          @if (pair().original; as d) {
            <ng-container *ngTemplateOutlet="docCard; context: { $implicit: d, badge: ('legislation.role.original' | transloco), tone: 'original' }" />
          } @else {
            <div class="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">{{ 'legislation.noOriginal' | transloco }}</div>
          }
        </li>
        <!-- alterations, oldest first -->
        @for (d of pair().alterations; track d.id; let i = $index) {
          <li class="relative pl-12">
            <span class="absolute top-10 bottom-[-1rem] left-[1.2rem] w-0.5 bg-brand-200" aria-hidden="true"></span>
            <span class="absolute top-2 left-0.5 grid size-9 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white ring-4 ring-sand-50" aria-hidden="true">{{ i + 1 }}</span>
            <ng-container *ngTemplateOutlet="docCard; context: { $implicit: d, badge: ('legislation.alterationN' | transloco: { n: i + 1 }), tone: 'alteracao' }" />
          </li>
        }
        <!-- revised text -->
        <li class="relative pl-12">
          <span class="absolute top-2 left-0.5 grid size-9 place-items-center rounded-full bg-ink text-white ring-4 ring-sand-50" aria-hidden="true"><app-icon name="check" [size]="16" /></span>
          @if (pair().revised; as d) {
            <ng-container *ngTemplateOutlet="docCard; context: { $implicit: d, badge: ('legislation.role.revisto' | transloco), tone: 'revisto' }" />
          } @else {
            <div class="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">{{ 'legislation.noRevised' | transloco }}</div>
          }
        </li>
      </ol>
    } @else if (!loading()) {
      <p class="card p-10 text-center text-slate-600">{{ 'legislation.notFound' | transloco }}</p>
    }

    <ng-template #docCard let-d let-badge="badge" let-tone="tone">
      <article class="rounded-lg border bg-white p-4 shadow-sm"
               [class]="tone === 'original' ? 'border-sun-400 border-l-4' : tone === 'revisto' ? 'border-brand-700 border-l-4' : 'border-sand-200'">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                [class]="tone === 'original' ? 'bg-sun-100 text-sun-700' : tone === 'revisto' ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-800'">{{ badge }}</span>
          <h3 class="font-semibold text-slate-900">{{ d.diploma }}</h3>
        </div>
        <p class="mt-1 text-sm text-slate-600">
          @if (d.publication) { {{ d.publication }} }
          @if (d.published_on) { · {{ d.published_on | date: 'dd/MM/yyyy' }} }
          @if (tone === 'alteracao' && pair().original; as o) { · <span class="text-brand-700">{{ 'legislation.amends' | transloco: { diploma: o.diploma } }}</span> }
        </p>
        @if (d.effect) { <p class="mt-2 text-sm text-slate-800">{{ d.effect }}</p> }
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" class="btn-secondary !py-1.5 text-sm" (click)="open(d)" [disabled]="opening() === d.id">
            <app-icon name="eye" [size]="14" /> {{ 'legislation.open' | transloco }}</button>
          <span class="truncate text-xs text-slate-600" [title]="d.original_name"><app-icon name="file" [size]="12" /> {{ d.original_name }} · {{ (d.size_bytes / 1024 / 1024).toFixed(1) }} MB</span>
          @if (canManage()) {
            <button type="button" class="btn-ghost ml-auto !p-1.5 text-red-600" (click)="remove(d)" [attr.aria-label]="'common.remove' | transloco"><app-icon name="trash" [size]="16" /></button>
          }
        </div>
      </article>
    </ng-template>
  `,
})
export class LegislationDetailPage {
  readonly id = input.required<string>();
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly dialog = inject(Dialog);
  private readonly ctx = inject(ContextStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly canManage = computed(() => this.ctx.isPlatform() && !!this.route.snapshot.data['admin']);
  protected readonly act = signal<LegalAct | null>(null);
  protected readonly docs = signal<LegalDocument[]>([]);
  protected readonly loading = signal(true);
  protected readonly opening = signal<string | null>(null);
  protected readonly pair = computed(() => pairing(this.docs()));

  constructor() { effect(() => { void this.load(this.id()); }); }

  private async load(id: string): Promise<void> {
    const [a, d] = await Promise.all([
      this.sb.client.from('legal_acts').select('*').eq('id', id).maybeSingle(),
      this.sb.client.from('legal_act_documents').select('*').eq('act_id', id),
    ]);
    if (a.error || d.error) this.toast.error(errorKey(a.error ?? d.error));
    this.act.set((a.data as LegalAct) ?? null);
    this.docs.set((d.data ?? []) as LegalDocument[]);
    this.loading.set(false);
  }

  /** Published legislation: a short-lived signed link, opened in a new tab. */
  protected async open(d: LegalDocument): Promise<void> {
    this.opening.set(d.id);
    const { data, error } = await this.sb.client.storage.from('legislation').createSignedUrl(d.storage_path, 120);
    this.opening.set(null);
    if (error) { this.toast.error(errorKey(error)); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  protected async add(): Promise<void> {
    const data: LegalDocumentDialogData = { actId: this.id(), docs: this.docs() };
    const ref = this.dialog.open<boolean>(LegalDocumentDialog, { data, ariaLabelledBy: 'ld-title', ariaModal: true });
    if (await firstValueFrom(ref.closed)) {
      this.toast.success('legislation.saved');
      await this.load(this.id());
    }
  }

  protected async remove(d: LegalDocument): Promise<void> {
    if (!(await this.confirm.ask({ title: 'legislation.removeTitle', body: 'legislation.removeBody', danger: true, confirm: 'common.remove',
                                   params: { name: d.diploma } }))) return;
    const { error } = await this.sb.client.from('legal_act_documents').delete().eq('id', d.id);
    if (error) { this.toast.error(errorKey(error)); return; }
    await this.sb.client.storage.from('legislation').remove([d.storage_path]);
    await this.load(this.id());
  }

  protected async removeAct(): Promise<void> {
    const a = this.act();
    if (!a || !(await this.confirm.ask({ title: 'legislation.removeActTitle', body: 'legislation.removeActBody', danger: true,
                                         confirm: 'common.remove', params: { name: a.title } }))) return;
    const paths = this.docs().map((d) => d.storage_path);
    const { error } = await this.sb.client.from('legal_acts').delete().eq('id', a.id);
    if (error) { this.toast.error(errorKey(error)); return; }
    if (paths.length) await this.sb.client.storage.from('legislation').remove(paths);
    await this.router.navigate(['..'], { relativeTo: this.route });
  }
}
