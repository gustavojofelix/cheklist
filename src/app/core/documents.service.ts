import { Injectable, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { OtpDialog } from '../shared/ui/otp.dialog';
import { Supabase } from './supabase';

export const DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

/** Uploads and downloads of organisation documents. */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly sb = inject(Supabase);
  private readonly dialog = inject(Dialog);

  /** Returns an i18n error key when the file cannot be uploaded, or null when it is fine. */
  check(f: File): string | null {
    if (!DOCUMENT_TYPES.includes(f.type)) return 'ficha.badType';
    if (f.size > DOCUMENT_MAX_BYTES) return 'errors.quota.file_size';
    return null;
  }

  /** Stores the file privately and links it to one or more checklist items. Returns the document id. */
  async upload(orgId: string, f: File, itemIds: string[]): Promise<string> {
    const safeName = f.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `${orgId}/${crypto.randomUUID()}/${safeName}`;
    const sha = await sha256(f);
    const up = await this.sb.client.storage.from('documents').upload(path, f, { contentType: f.type, upsert: false });
    if (up.error) throw up.error;
    return this.sb.rpc<string>('register_document', {
      org: orgId, p_path: path, p_name: f.name, p_mime: f.type, p_size: f.size, p_sha256: sha, p_item_ids: itemIds,
    });
  }

  /** Downloads go through the document-download Edge Function; asks for an e-mail code when the org requires it. */
  async download(documentId: string, orgId: string): Promise<void> {
    try {
      await this.open(documentId);
    } catch (e) {
      if ((e as Error).message !== 'otp_required') throw e;
      const ref = this.dialog.open<boolean>(OtpDialog, { data: { orgId } });
      if (await firstValueFrom(ref.closed)) await this.open(documentId);
    }
  }

  private async open(documentId: string): Promise<void> {
    const { url } = await this.sb.fn<{ url: string }>('document-download', { document_id: documentId });
    window.open(url, '_blank', 'noopener');
  }
}

async function sha256(f: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
