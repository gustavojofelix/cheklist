import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';

/** E-mail one-time code that unlocks document downloads for a while. Closes with true when unlocked. */
@Component({
  selector: 'app-otp-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe],
  template: `
    <form class="w-[min(26rem,calc(100vw-2rem))] rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" (ngSubmit)="verify()">
      <h2 class="text-lg font-semibold">{{ 'otp.title' | transloco }}</h2>
      <p class="mt-1 text-sm text-slate-600">{{ (sent() ? 'otp.sent' : 'otp.intro') | transloco }}</p>
      @if (sent()) {
        <input class="input mt-4 text-center font-mono text-2xl tracking-[0.5em]" name="code" [(ngModel)]="code" maxlength="6"
               inputmode="numeric" autocomplete="one-time-code" [attr.aria-label]="'otp.code' | transloco" />
      }
      @if (error()) { <p class="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error()! | transloco }}</p> }
      <div class="mt-6 flex justify-between gap-2">
        <button type="button" class="btn-ghost" (click)="request()" [disabled]="busy()">{{ (sent() ? 'otp.resend' : 'otp.send') | transloco }}</button>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" (click)="ref.close(false)">{{ 'common.cancel' | transloco }}</button>
          @if (sent()) { <button type="submit" class="btn-primary" [disabled]="busy() || code.length !== 6">{{ 'otp.verify' | transloco }}</button> }
        </div>
      </div>
    </form>
  `,
})
export class OtpDialog {
  private readonly data = inject<{ orgId: string }>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly sb = inject(Supabase);
  protected readonly sent = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected code = '';

  protected async request(): Promise<void> {
    await this.run(async () => {
      await this.sb.rpc('otp_request', { org: this.data.orgId });
      this.sent.set(true);
    });
  }

  protected async verify(): Promise<void> {
    await this.run(async () => {
      const until = await this.sb.rpc<string | null>('otp_verify', { org: this.data.orgId, code: this.code });
      if (!until) { this.error.set('errors.otp_invalid'); return; }
      this.ref.close(true);
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try { await fn(); } catch (e) { this.error.set(errorKey(e)); } finally { this.busy.set(false); }
  }
}
