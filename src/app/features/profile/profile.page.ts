import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth.service';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { PageHeader } from '../../shared/ui/page-header';
import { errorOf, phone9, sameAs } from '../../shared/validators';

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, PageHeader],
  template: `
    <app-page-header [title]="'nav.profile' | transloco" />
    <div class="grid max-w-3xl gap-6">
      <form class="card space-y-4 p-5" [formGroup]="info" (ngSubmit)="saveInfo()" novalidate>
        <h2 class="font-semibold">{{ 'profile.info' | transloco }}</h2>
        <div><label class="label" for="p-name">{{ 'auth.fullName' | transloco }}</label><input id="p-name" class="input" formControlName="full_name" /></div>
        <div><label class="label" for="p-email">{{ 'auth.email' | transloco }}</label><input id="p-email" type="email" class="input" formControlName="email" />
          <p class="mt-1 text-xs text-slate-600">{{ 'profile.emailHint' | transloco }}</p></div>
        <div><label class="label" for="p-phone">{{ 'auth.phone' | transloco }}</label><input id="p-phone" class="input" formControlName="phone_number" maxlength="9" />
          @if (e(info, 'phone_number'); as k) { <p class="field-error">{{ k | transloco }}</p> }</div>
        <div class="flex justify-end"><button class="btn-primary" type="submit" [disabled]="busy() || info.invalid">{{ 'common.save' | transloco }}</button></div>
      </form>
      <form class="card space-y-4 p-5" [formGroup]="pw" (ngSubmit)="savePassword()" novalidate>
        <h2 class="font-semibold">{{ 'profile.password' | transloco }}</h2>
        <p class="text-sm text-slate-600">{{ 'profile.passwordHint' | transloco }}</p>
        <div><label class="label" for="p-pw">{{ 'auth.newPassword' | transloco }}</label><input id="p-pw" type="password" class="input" formControlName="password" autocomplete="new-password" />
          @if (e(pw, 'password'); as k) { <p class="field-error">{{ k | transloco: { min: 8 } }}</p> }</div>
        <div><label class="label" for="p-pw2">{{ 'auth.confirmPassword' | transloco }}</label><input id="p-pw2" type="password" class="input" formControlName="confirm" autocomplete="new-password" />
          @if (e(pw, 'confirm'); as k) { <p class="field-error">{{ k | transloco }}</p> }</div>
        <div class="flex justify-end"><button class="btn-primary" type="submit" [disabled]="busy() || pw.invalid">{{ 'profile.updatePassword' | transloco }}</button></div>
      </form>
    </div>
  `,
})
export class ProfilePage {
  private readonly ctx = inject(ContextStore);
  private readonly sb = inject(Supabase);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  protected readonly busy = signal(false);
  protected readonly info = this.fb.nonNullable.group({
    full_name: ['', Validators.required], email: ['', [Validators.required, Validators.email]], phone_number: ['', phone9],
  });
  protected readonly pw = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]], confirm: ['', [Validators.required, sameAs('password')]],
  });

  constructor() {
    effect(() => {
      const p = this.ctx.profile();
      if (p) this.info.patchValue({ full_name: p.full_name, email: p.email, phone_number: p.phone_number ?? '' });
    });
  }

  protected e(g: { get(n: string): import('@angular/forms').AbstractControl | null }, n: string): string | null { return errorOf(g.get(n)); }

  protected async saveInfo(): Promise<void> {
    await this.run(async () => {
      const v = this.info.getRawValue();
      const p = this.ctx.profile()!;
      const { error } = await this.sb.client.from('profiles').update({ full_name: v.full_name.trim(), phone_number: v.phone_number || null }).eq('id', p.id);
      if (error) throw error;
      if (v.email.trim().toLowerCase() !== p.email.toLowerCase()) {
        await this.auth.updateEmail(v.email.trim());
        this.toast.success('profile.emailSent');
      }
      await this.ctx.load();
    });
  }

  protected async savePassword(): Promise<void> {
    await this.run(async () => {
      await this.auth.updatePassword(this.pw.getRawValue().password);
      this.pw.reset();
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try { await fn(); this.toast.success('common.saved'); } catch (err) { this.toast.error(errorKey(err)); } finally { this.busy.set(false); }
  }
}
