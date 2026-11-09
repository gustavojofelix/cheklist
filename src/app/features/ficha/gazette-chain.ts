import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../shared/ui/icon';
import { FichaDocument, FichaItem, isAlteration, isOriginal } from './ficha.types';

interface Link { entry: FichaItem; kind: 'original' | 'alteration' | 'other'; n: number; docs: FichaDocument[] }

/**
 * The company's articles in the Boletim da República: the original publication (incorporation) and,
 * linked to it, every alteration in date order — so the current text of the articles can be rebuilt.
 */
@Component({
  selector: 'app-gazette-chain',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, TranslocoPipe, Icon],
  template: `
    <section class="rounded-lg border border-sand-200 bg-sand-50 p-4" [attr.aria-label]="'gazette.title' | transloco">
      <div class="flex flex-wrap items-center gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold text-slate-900">{{ 'gazette.title' | transloco }}</h3>
          <p class="text-xs text-slate-600">
            @if (original()) {
              {{ 'gazette.counts' | transloco: { n: alterationCount() } }}
              @if (lastAlteration(); as l) { · {{ 'gazette.lastAlteration' | transloco }} {{ l.publication_date | date: 'dd/MM/yyyy' }} }
            } @else {
              {{ 'gazette.empty' | transloco }}
            }
          </p>
        </div>
        @if (canManage()) {
          <button type="button" class="btn-secondary !py-1.5 text-sm" (click)="add.emit()">
            <app-icon name="plus" [size]="14" /> {{ (original() ? 'gazette.addAlteration' : 'gazette.addOriginal') | transloco }}</button>
        }
      </div>

      @if (orphans()) {
        <p class="mt-3 flex items-center gap-2 rounded bg-sun-100 px-3 py-2 text-sm text-sun-700"><app-icon name="alert" [size]="14" /> {{ 'gazette.missingOriginal' | transloco }}</p>
      }

      @if (links().length) {
        <ol class="mt-4 space-y-3">
          @for (l of links(); track l.entry.id; let last = $last) {
            <li class="relative pl-10">
              <!-- the thread that ties every alteration to the original -->
              @if (!last) { <span class="absolute top-8 bottom-[-0.75rem] left-[0.95rem] w-0.5 bg-brand-200" aria-hidden="true"></span> }
              @if (l.kind === 'original') {
                <span class="absolute top-1 left-0 grid size-8 place-items-center" aria-hidden="true">
                  <span class="size-6 rotate-45 rounded-sm bg-sun-400 ring-4 ring-sand-50"></span>
                  <span class="absolute size-2.5 rotate-45 bg-ink"></span>
                </span>
              } @else {
                <span class="absolute top-1 left-0 grid size-8 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white ring-4 ring-sand-50" aria-hidden="true">
                  {{ l.kind === 'alteration' ? l.n : '•' }}</span>
              }
              <article class="rounded-lg border bg-white p-3"
                       [class]="l.kind === 'original' ? 'border-sun-400 border-l-4' : 'border-sand-200'">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-mono text-xs text-brand-700">{{ l.entry.catalog_code }}</span>
                  <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        [class]="l.kind === 'original' ? 'bg-sun-100 text-sun-700' : l.kind === 'alteration' ? 'bg-brand-50 text-brand-800' : 'bg-sand-100 text-slate-700'">
                    {{ l.kind === 'original' ? ('gazette.original' | transloco) : l.kind === 'alteration' ? ('gazette.alterationN' | transloco: { n: l.n }) : ('gazette.other' | transloco) }}</span>
                  <span class="font-medium text-slate-900">{{ 'gazette.subtype.' + l.entry.br_subtype | transloco }}</span>
                  @if (editMode() && canManage()) {
                    <button type="button" class="btn-ghost ml-auto !p-1 text-red-600" (click)="remove.emit(l.entry)" [attr.aria-label]="'common.remove' | transloco"><app-icon name="trash" [size]="14" /></button>
                  }
                </div>
                <p class="mt-1 text-xs text-slate-600">
                  {{ 'gazette.published' | transloco }} {{ l.entry.publication_date | date: 'dd/MM/yyyy' }}
                  @if (l.entry.publication_series) { · {{ l.entry.publication_series }} }
                  @if (l.kind === 'alteration' && original(); as o) { · <span class="text-brand-700">{{ 'gazette.amends' | transloco: { code: o.catalog_code } }}</span> }
                </p>
                @if (l.entry.answer) { <p class="mt-2 text-sm text-slate-800">{{ l.entry.answer }}</p> }
                <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  @for (d of l.docs; track d.id) {
                    <button type="button" class="inline-flex min-h-6 items-center gap-1 text-brand-700 hover:underline" (click)="download.emit(d)" [title]="d.original_name">
                      <app-icon name="file" [size]="12" /> {{ d.original_name }}</button>
                  } @empty {
                    <span class="text-sun-700">{{ 'gazette.noDocument' | transloco }}</span>
                  }
                  @if (canWrite()) {
                    <button type="button" class="btn-ghost !px-2 !py-1 text-xs" (click)="attach.emit(l.entry)">
                      <app-icon name="paperclip" [size]="12" /> {{ 'ficha.attach' | transloco }}</button>
                  }
                </div>
              </article>
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class GazetteChain {
  readonly entries = input.required<FichaItem[]>();
  readonly docs = input.required<FichaDocument[]>();
  readonly canManage = input(false);
  readonly canWrite = input(false);
  readonly editMode = input(false);
  readonly add = output<void>();
  readonly attach = output<FichaItem>();
  readonly remove = output<FichaItem>();
  readonly download = output<FichaDocument>();

  /** Original first, then alterations (numbered 1, 2, 3…) and other publications in date order. */
  protected readonly links = computed<Link[]>(() => {
    const byDate = [...this.entries()].sort((a, b) =>
      (isOriginal(b.br_subtype) ? 1 : 0) - (isOriginal(a.br_subtype) ? 1 : 0)
      || (a.publication_date ?? '').localeCompare(b.publication_date ?? '') || (a.catalog_code ?? '').localeCompare(b.catalog_code ?? ''));
    let n = 0;
    return byDate.map((entry) => {
      const kind = isOriginal(entry.br_subtype) ? 'original' : isAlteration(entry.br_subtype) ? 'alteration' : 'other';
      if (kind === 'alteration') n++;
      return { entry, kind, n, docs: this.docs().filter((d) => d.item_ids.includes(entry.id)) };
    });
  });
  protected readonly original = computed(() => this.links().find((l) => l.kind === 'original')?.entry ?? null);
  protected readonly alterationCount = computed(() => this.links().filter((l) => l.kind === 'alteration').length);
  protected readonly lastAlteration = computed(() => [...this.links()].reverse().find((l) => l.kind === 'alteration')?.entry ?? null);
  protected readonly orphans = computed(() => !this.original() && this.alterationCount() > 0);
}
