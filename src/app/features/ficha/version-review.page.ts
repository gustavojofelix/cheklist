import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/ui/confirm';

export interface VersionOffer {
  version_id: string; version_number: number; current_version: number; template_name: string;
  added: { code: string; title: string }[]; removed: { code: string; title: string }[];
  changed: { code: string; from: string; to: string }[]; customer_added: { code: string | null; title: string }[];
}

/** Customer reviews a new template version and decides: keep own changes, or take the new version. */
@Component({
  selector: 'app-version-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe],
  template: `
    <nav class="mb-2 text-sm text-slate-500"><a [routerLink]="['/entities', id(), 'ficha']" class="hover:underline">{{ 'version.back' | transloco }}</a></nav>
    @if (offer(); as o) {
      <h1 class="text-2xl font-semibold">{{ 'version.title' | transloco: { n: o.version_number, template: o.template_name } }}</h1>
      <p class="mt-1 text-sm text-slate-500">{{ 'version.subtitle' | transloco: { current: o.current_version } }}</p>
      <div class="mt-6 grid gap-4 lg:grid-cols-2">
        @for (sec of sections(o); track sec.key) {
          <section class="card p-4">
            <h2 class="font-semibold">{{ 'version.' + sec.key | transloco }} <span class="text-slate-500">({{ sec.rows.length }})</span></h2>
            <ul class="mt-2 space-y-1 text-sm">
              @for (r of sec.rows; track $index) { <li><span class="font-mono text-xs text-brand-700">{{ r.code }}</span> {{ r.text }}</li> }
              @empty { <li class="text-slate-500">—</li> }
            </ul>
          </section>
        }
      </div>
      <div class="card mt-6 p-5 text-sm text-slate-600">
        <p><strong>{{ 'version.keep' | transloco }}:</strong> {{ 'version.keepHint' | transloco }}</p>
        <p class="mt-2"><strong>{{ 'version.take' | transloco }}:</strong> {{ 'version.takeHint' | transloco }}</p>
        @if (ctx.canWrite('admin')) {
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" class="btn-secondary" [disabled]="busy()" (click)="apply('keep')">{{ 'version.keep' | transloco }}</button>
            <button type="button" class="btn-primary" [disabled]="busy()" (click)="apply('take')">{{ 'version.take' | transloco }}</button>
          </div>
        } @else {
          <p class="mt-4 text-amber-700">{{ 'version.adminOnly' | transloco }}</p>
        }
      </div>
    } @else if (loaded()) {
      <p class="card p-8 text-center text-slate-500">{{ 'version.none' | transloco }}</p>
    }
  `,
})
export class VersionReviewPage {
  readonly id = input.required<string>();
  protected readonly ctx = inject(ContextStore);
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  protected readonly offer = signal<VersionOffer | null>(null);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => { void this.load(this.id()); });
  }

  private async load(org: string): Promise<void> {
    this.offer.set(await this.sb.rpc<VersionOffer | null>('version_offer', { org }));
    this.loaded.set(true);
  }

  protected sections(o: VersionOffer) {
    return [
      { key: 'added', rows: o.added.map((r) => ({ code: r.code, text: r.title })) },
      { key: 'removed', rows: o.removed.map((r) => ({ code: r.code, text: r.title })) },
      { key: 'changed', rows: o.changed.map((r) => ({ code: r.code, text: `${r.from} → ${r.to}` })) },
      { key: 'customerAdded', rows: o.customer_added.map((r) => ({ code: r.code ?? '', text: r.title })) },
    ];
  }

  protected async apply(mode: 'keep' | 'take'): Promise<void> {
    if (!(await this.confirm.ask({ title: 'version.' + mode, body: 'version.' + mode + 'Hint' }))) return;
    this.busy.set(true);
    try {
      await this.sb.rpc('apply_template_version', { org: this.id(), p_version: this.offer()!.version_id, p_mode: mode });
      this.toast.success('version.applied');
      await this.router.navigate(['/entities', this.id(), 'ficha']);
    } catch (e) { this.toast.error(errorKey(e)); } finally { this.busy.set(false); }
  }
}
