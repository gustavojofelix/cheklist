import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  template: `
    <h1 class="text-2xl font-semibold text-slate-900">{{ 'auth.forgot.title' | transloco }}</h1>
    <p class="mt-1 text-sm text-slate-500">{{ 'auth.forgot.subtitle' | transloco }}</p>
    @if (sent()) {
      <p class="mt-6 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{{ 'auth.forgot.sent' | transloco }}</p>
    } @else {
      <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label class="label" for="f-email">{{ 'auth.email' | transloco }}</label>
          <input id="f-email" type="email" class="input" formControlName="email" autocomplete="email" />
        </div>
        <button type="submit" class="btn-primary w-full" [disabled]="busy() || form.invalid">{{ 'auth.forgot.submit' | transloco }}</button>
      </form>
    }
    <p class="mt-6 text-center text-sm"><a routerLink="/login" class="text-brand-600 hover:underline">{{ 'common.back' | transloco }}</a></p>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]] });

  protected async submit(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.requestPasswordReset(this.form.getRawValue().email.trim());
    } catch {
      // Same response whether or not the e-mail exists (no account enumeration).
    } finally {
      this.busy.set(false);
      this.sent.set(true);
    }
  }
}
