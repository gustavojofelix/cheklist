import { Injectable, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { OtpDialog } from '../shared/ui/otp.dialog';
import { Supabase } from './supabase';

/** Downloads go through the document-download Edge Function; asks for an e-mail code when the org requires it. */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly sb = inject(Supabase);
  private readonly dialog = inject(Dialog);

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
