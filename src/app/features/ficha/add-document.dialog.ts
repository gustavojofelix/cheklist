import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { Icon } from '../../shared/ui/icon';
import { FichaItem } from './ficha.types';

export interface AddDocumentData { orgId: string; items: FichaItem[]; preselect?: string[]; titleOf: (i: FichaItem) => string }

const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_BYTES = 20 * 1024 * 1024;

/** Upload one file and relate it to one or more checklist items. */
@Component({
  selector: 'app-add-document-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, Icon],
  template: `
    <div class="flex max-h-[90vh] w-[min(40rem,calc(100vw-2rem))] flex-col rounded-xl bg-white shadow-xl" role="dialog" aria-modal="true">
      <div class="border-b border-slate-100 p-5">
        <h2 class="text-lg font-semibold">{{ 'ficha.addDocument' | transloco }}</h2>
        <p class="mt-1 text-sm text-slate-600">{{ 'ficha.addDocumentHint' | transloco }}</p>
      </div>
      <div class="flex-1 overflow-y-auto p-5">
        <label class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 hover:border-brand-500"
               (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
          <app-icon name="upload" [size]="24" />
          @if (file(); as f) {
            <span class="font-medium text-slate-800">{{ f.name }}</span>
            <span class="text-xs">{{ (f.size / 1024 / 1024).toFixed(2) }} MB</span>
          } @else {
            <span>{{ 'ficha.dropHere' | transloco }}</span>
            <span class="text-xs">PDF, PNG, JPG, DOCX · máx. 20 MB</span>
          }
          <input type="file" class="sr-only" [accept]="accept" (change)="onPick($any($event.target).files)" />
        </label>
        @if (fileError()) { <p class="field-error">{{ fileError()! | transloco }}</p> }

        <p class="label mt-5">{{ 'ficha.relateTo' | transloco }}</p>
        @if (!selected().size) { <p class="mb-2 text-xs text-amber-700">{{ 'errors.select_at_least_one_item' | transloco }}</p> }
        <ul class="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-sm">
          @for (i of data.items; track i.id) {
            <li><label class="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50">
              <input type="checkbox" [checked]="selected().has(i.id)" (change)="toggle(i.id)" />
              <span class="font-mono text-xs text-brand-700">{{ i.catalog_code }}</span> {{ data.titleOf(i) }}
            </label></li>
          }
        </ul>
        @if (error()) { <p class="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error()! | transloco }}</p> }
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-100 p-4">
        <button type="button" class="btn-secondary" (click)="ref.close(false)" [disabled]="busy()">{{ 'common.cancel' | transloco }}</button>
        <button type="button" class="btn-primary" (click)="upload()" [disabled]="!canSubmit()">
          {{ (busy() ? 'ficha.uploading' : 'ficha.upload') | transloco }}</button>
      </div>
    </div>
  `,
})
export class AddDocumentDialog {
  protected readonly data = inject<AddDocumentData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly sb = inject(Supabase);
  protected readonly accept = ACCEPT.join(',');
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly selected = signal(new Set<string>(this.data.preselect ?? []));
  protected readonly canSubmit = computed(() => !!this.file() && this.selected().size > 0 && !this.busy());

  protected toggle(id: string): void {
    this.selected.update((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  protected onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.onPick(ev.dataTransfer?.files ?? null);
  }

  protected onPick(files: FileList | null): void {
    const f = files?.[0] ?? null;
    this.fileError.set(null);
    if (!f) return;
    if (!ACCEPT.includes(f.type)) { this.fileError.set('ficha.badType'); return; }
    if (f.size > MAX_BYTES) { this.fileError.set('errors.quota.file_size'); return; }
    this.file.set(f);
  }

  protected async upload(): Promise<void> {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    this.error.set(null);
    const safeName = f.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `${this.data.orgId}/${crypto.randomUUID()}/${safeName}`;
    try {
      const sha = await sha256(f);
      const up = await this.sb.client.storage.from('documents').upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) throw up.error;
      await this.sb.rpc('register_document', {
        org: this.data.orgId, p_path: path, p_name: f.name, p_mime: f.type, p_size: f.size, p_sha256: sha,
        p_item_ids: [...this.selected()],
      });
      this.ref.close(true);
    } catch (e) {
      this.error.set(errorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}

async function sha256(f: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
