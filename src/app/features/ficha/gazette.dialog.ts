import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DOCUMENT_TYPES, DocumentsService } from '../../core/documents.service';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { Icon } from '../../shared/ui/icon';
import { FichaItem, GAZETTE_ALTERATIONS, GAZETTE_ORIGINALS, GazetteSubtype } from './ficha.types';

export interface GazetteDialogData { host: FichaItem; entries: FichaItem[] }

/** Registers one Boletim da República publication (the original or an alteration) and, optionally, its document. */
@Component({
  selector: 'app-gazette-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, Icon],
  template: `
    <form class="flex max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] flex-col rounded-xl bg-white shadow-xl" (ngSubmit)="save()">
      <div class="border-b border-slate-100 p-5">
        <h2 id="gz-title" class="text-lg font-semibold">{{ (hasOriginal ? 'gazette.addAlteration' : 'gazette.addOriginal') | transloco }}</h2>
        <p class="mt-1 text-sm text-slate-600">{{ (hasOriginal ? 'gazette.alterationHint' : 'gazette.originalHint') | transloco }}</p>
      </div>
      <div class="flex-1 space-y-4 overflow-y-auto p-5">
        <div>
          <label class="label" for="gz-type">{{ 'gazette.type' | transloco }}</label>
          <select id="gz-type" class="input" name="type" [(ngModel)]="type" required>
            @if (!hasOriginal) {
              <optgroup [label]="'gazette.group.original' | transloco">
                @for (s of originals; track s) { <option [value]="s">{{ 'gazette.subtype.' + s | transloco }}</option> }
              </optgroup>
            } @else {
              <optgroup [label]="'gazette.group.alteration' | transloco">
                @for (s of alterations; track s) { <option [value]="s">{{ 'gazette.subtype.' + s | transloco }}</option> }
              </optgroup>
            }
            <option value="outros">{{ 'gazette.subtype.outros' | transloco }}</option>
          </select>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="gz-date">{{ 'gazette.date' | transloco }}</label>
            <input id="gz-date" class="input" type="date" name="date" [(ngModel)]="date" required [max]="today" />
          </div>
          <div>
            <label class="label" for="gz-series">{{ 'gazette.series' | transloco }}</label>
            <input id="gz-series" class="input" name="series" [(ngModel)]="series" [placeholder]="'gazette.seriesPlaceholder' | transloco" />
          </div>
        </div>
        @if (beforeOriginal()) { <p class="rounded bg-sun-100 px-3 py-2 text-sm text-sun-700">{{ 'gazette.beforeOriginal' | transloco }}</p> }
        <div>
          <label class="label" for="gz-summary">{{ 'gazette.summary' | transloco }}</label>
          <textarea id="gz-summary" class="input" rows="2" name="summary" [(ngModel)]="summary" [placeholder]="'gazette.summaryPlaceholder' | transloco"></textarea>
        </div>
        <div>
          <p class="label">{{ 'gazette.document' | transloco }}</p>
          <label class="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-600 hover:border-brand-500">
            <app-icon name="upload" [size]="20" />
            @if (file(); as f) { <span class="font-medium text-slate-800">{{ f.name }}</span> }
            @else { <span>{{ 'gazette.documentHint' | transloco }}</span> }
            <input type="file" class="sr-only" [accept]="accept" (change)="onPick($any($event.target).files)" />
          </label>
          @if (fileError()) { <p class="field-error">{{ fileError()! | transloco }}</p> }
        </div>
        @if (error()) { <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error()! | transloco }}</p> }
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-100 p-4">
        <button type="button" class="btn-secondary" (click)="ref.close(false)" [disabled]="busy()">{{ 'common.cancel' | transloco }}</button>
        <button type="submit" class="btn-primary" [disabled]="busy() || !type || !date">{{ (busy() ? 'gazette.saving' : 'common.save') | transloco }}</button>
      </div>
    </form>
  `,
})
export class GazetteDialog {
  protected readonly data = inject<GazetteDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly sb = inject(Supabase);
  private readonly documents = inject(DocumentsService);
  private readonly t = inject(TranslocoService);
  protected readonly originals = GAZETTE_ORIGINALS;
  protected readonly alterations = GAZETTE_ALTERATIONS;
  protected readonly accept = DOCUMENT_TYPES.join(',');
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly original = this.data.entries.find((e) => e.br_subtype?.startsWith('constituicao_')) ?? null;
  protected readonly hasOriginal = !!this.original;

  protected type: GazetteSubtype | '' = this.hasOriginal ? 'alteracao_pacto' : 'constituicao_quotas';
  protected date = '';
  protected series = '';
  protected summary = '';
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** An alteration cannot be published before the original it amends. */
  protected beforeOriginal(): boolean {
    const o = this.original?.publication_date;
    return !!o && !!this.date && this.type.startsWith('alteracao_') && this.date < o;
  }

  protected onPick(files: FileList | null): void {
    const f = files?.[0] ?? null;
    this.fileError.set(null);
    if (!f) return;
    const bad = this.documents.check(f);
    if (bad) { this.fileError.set(bad); return; }
    this.file.set(f);
  }

  protected async save(): Promise<void> {
    if (!this.type || !this.date) return;
    if (this.beforeOriginal()) { this.error.set('gazette.beforeOriginal'); return; }
    this.busy.set(true);
    this.error.set(null);
    const h = this.data.host;
    try {
      const { data, error } = await this.sb.client.from('checklist_items').insert({
        checklist_id: h.checklist_id, organization_id: h.organization_id, parent_id: h.id, catalog_group: h.catalog_group,
        is_official_gazette: true, br_subtype: this.type, title: this.t.translate(`gazette.subtype.${this.type}`),
        publication_date: this.date, publication_series: this.series.trim() || null, answer: this.summary.trim() || null,
        requires_attachment: true, sort_order: this.data.entries.length + 1,
      }).select('id').single();
      if (error) throw error;
      const f = this.file();
      if (f) await this.documents.upload(h.organization_id, f, [data.id]);
      this.ref.close(true);
    } catch (e) {
      this.error.set(errorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
