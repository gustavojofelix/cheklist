import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth.service';
import { errorKey } from '../../core/errors';
import { ToastService } from '../../core/toast.service';
import { errorOf, sameAs } from '../../shared/validators';

@Component({
  selector: 'app-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe],
  template: `
    <h1 class="text-2xl font-semibold text-slate-900">{{ 'auth.reset.title' | transloco }}</h1>
    @if (!auth.session()) {
      <p class="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{{ 'auth.reset.invalidLink' | transloco }}</p>
    } @else {
      @if (error()) { <p class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ error()! | transloco }}</p> }
      <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label class="label" for="n-pw">{{ 'auth.newPassword' | transloco }}</label>
          <input id="n-pw" type="password" class="input" formControlName="password" autocomplete="new-password" />
          @if (e('password'); as k) { <p class="field-error">{{ k | transloco: { min: 8 } }}</p> }
        </div>
        <div>
          <label class="label" for="n-pw2">{{ 'auth.confirmPassword' | transloco }}</label>
          <input id="n-pw2" type="password" class="input" formControlName="confirm" autocomplete="new-password" />
          @if (e('confirm'); as k) { <p class="field-error">{{ k | transloco }}</p> }
        </div>
        <button type="submit" class="btn-primary w-full" [disabled]="busy() || form.invalid">{{ 'auth.reset.submit' | transloco }}</button>
      </form>
    }
  `,
})
export class ResetPasswordPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required, sameAs('password')]],
  });

  protected e(n: string): string | null { return errorOf(this.form.get(n)); }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.updatePassword(this.form.getRawValue().password);
      this.toast.success('auth.reset.done');
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.error.set(errorKey(err));
    } finally {
      this.busy.set(false);
    }
  }
}
