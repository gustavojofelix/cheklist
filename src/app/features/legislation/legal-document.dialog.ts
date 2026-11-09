import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { DOCUMENT_TYPES, DocumentsService } from '../../core/documents.service';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { Icon } from '../../shared/ui/icon';
import { LegalDocRole, LegalDocument } from './legislation.types';

export interface LegalDocumentDialogData { actId: string; docs: LegalDocument[] }

/** Back office: add the original, an alteration or the revised text of a diploma, with its file. */
@Component({
  selector: 'app-legal-document-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, Icon],
  template: `
    <form class="flex max-h-[90vh] w-[min(38rem,calc(100vw-2rem))] flex-col rounded-xl bg-white shadow-xl" (ngSubmit)="save()">
      <div class="border-b border-slate-100 p-5">
        <h2 id="ld-title" class="text-lg font-semibold">{{ 'legislation.addDocument' | transloco }}</h2>
        <p class="mt-1 text-sm text-slate-600">{{ 'legislation.addDocumentHint' | transloco }}</p>
      </div>
      <div class="flex-1 space-y-4 overflow-y-auto p-5">
        <fieldset>
          <legend class="label">{{ 'legislation.field.role' | transloco }}</legend>
          <div class="grid gap-2 sm:grid-cols-3">
            @for (r of roles; track r) {
              <label class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                     [class.opacity-50]="taken(r)">
                <input type="radio" name="role" [value]="r" [(ngModel)]="role" [disabled]="taken(r)" />
                {{ 'legislation.role.' + r | transloco }}
              </label>
            }
          </div>
        </fieldset>
        <div>
          <label class="label" for="ld-diploma">{{ 'legislation.field.diploma' | transloco }}</label>
          <input id="ld-diploma" class="input" name="diploma" [(ngModel)]="diploma" required [placeholder]="'legislation.diplomaPlaceholder' | transloco" />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="label" for="ld-pub">{{ 'legislation.field.publication' | transloco }}</label>
            <input id="ld-pub" class="input" name="publication" [(ngModel)]="publication" [placeholder]="'legislation.publicationPlaceholder' | transloco" />
          </div>
          <div>
            <label class="label" for="ld-date">{{ 'legislation.field.publishedOn' | transloco }}</label>
            <input id="ld-date" class="input" type="date" name="date" [(ngModel)]="date" />
          </div>
        </div>
        <div>
          <label class="label" for="ld-effect">{{ 'legislation.field.effect' | transloco }}</label>
          <textarea id="ld-effect" class="input" rows="2" name="effect" [(ngModel)]="effect" [placeholder]="'legislation.effectPlaceholder' | transloco"></textarea>
        </div>
        <div>
          <p class="label">{{ 'legislation.field.file' | transloco }}</p>
          <label class="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-600 hover:border-brand-500">
            <app-icon name="upload" [size]="20" />
            @if (file(); as f) { <span class="font-medium text-slate-800">{{ f.name }} · {{ (f.size / 1024 / 1024).toFixed(1) }} MB</span> }
            @else { <span>{{ 'legislation.fileHint' | transloco }}</span> }
            <input type="file" class="sr-only" [accept]="accept" (change)="onPick($any($event.target).files)" />
          </label>
          @if (fileError()) { <p class="field-error">{{ fileError()! | transloco }}</p> }
        </div>
        @if (error()) { <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error()! | transloco }}</p> }
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-100 p-4">
        <button type="button" class="btn-secondary" (click)="ref.close(false)" [disabled]="busy()">{{ 'common.cancel' | transloco }}</button>
        <button type="submit" class="btn-primary" [disabled]="busy() || !diploma.trim() || !file()">
          {{ (busy() ? 'ficha.uploading' : 'ficha.upload') | transloco }}</button>
      </div>
    </form>
  `,
})
export class LegalDocumentDialog {
  protected readonly data = inject<LegalDocumentDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly sb = inject(Supabase);
  private readonly documents = inject(DocumentsService);
  protected readonly roles: LegalDocRole[] = ['original', 'alteracao', 'revisto'];
  protected readonly accept = DOCUMENT_TYPES.join(',');
  protected role: LegalDocRole = this.taken('original') ? 'alteracao' : 'original';
  protected diploma = '';
  protected publication = '';
  protected date = '';
  protected effect = '';
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** Only one original and one revised text per diploma. */
  protected taken(r: LegalDocRole): boolean { return r !== 'alteracao' && this.data.docs.some((d) => d.role === r); }

  protected onPick(files: FileList | null): void {
    const f = files?.[0] ?? null;
    this.fileError.set(null);
    if (!f) return;
    const bad = f.size > 50 * 1024 * 1024 ? 'errors.quota.file_size' : this.documents.check(f) === 'ficha.badType' ? 'ficha.badType' : null;
    if (bad) { this.fileError.set(bad); return; }
    this.file.set(f);
  }

  protected async save(): Promise<void> {
    const f = this.file();
    if (!f || !this.diploma.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    const safeName = f.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `${this.data.actId}/${crypto.randomUUID()}/${safeName}`;
    try {
      const up = await this.sb.client.storage.from('legislation').upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await this.sb.client.from('legal_act_documents').insert({
        act_id: this.data.actId, role: this.role, diploma: this.diploma.trim(), publication: this.publication.trim() || null,
        published_on: this.date || null, effect: this.effect.trim() || null,
        storage_path: path, original_name: f.name, mime_type: f.type, size_bytes: f.size,
      });
      if (error) {
        await this.sb.client.storage.from('legislation').remove([path]);
        throw error;
      }
      this.ref.close(true);
    } catch (e) {
      this.error.set(errorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
