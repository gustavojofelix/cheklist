import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth.service';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { LocaleService } from '../../core/i18n';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  template: `
    <h1 class="text-2xl font-semibold text-slate-900">{{ 'auth.login.title' | transloco }}</h1>
    <p class="mt-1 text-sm text-slate-600">{{ 'auth.login.subtitle' | transloco }}</p>

    @if (suspended()) {
      <p class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ 'auth.login.suspended' | transloco }}</p>
    }
    @if (error()) {
      <p class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error()! | transloco }}</p>
    }

    <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div>
        <label class="label" for="email">{{ 'auth.email' | transloco }}</label>
        <input id="email" type="email" class="input" formControlName="email" autocomplete="email" />
      </div>
      <div>
        <div class="flex items-center justify-between">
          <label class="label" for="password">{{ 'auth.password' | transloco }}</label>
          <a routerLink="/forgot-password" class="mb-1 text-xs font-medium text-brand-600 hover:underline">{{ 'auth.login.forgot' | transloco }}</a>
        </div>
        <input id="password" type="password" class="input" formControlName="password" autocomplete="current-password" />
      </div>
      <button type="submit" class="btn-primary w-full" [disabled]="busy() || form.invalid">
        {{ (busy() ? 'common.wait' : 'auth.login.submit') | transloco }}
      </button>
    </form>
    <p class="mt-6 text-center text-sm text-slate-600">
      {{ 'auth.login.noAccount' | transloco }}
      <a routerLink="/register" class="font-medium text-brand-600 hover:underline">{{ 'auth.login.createOne' | transloco }}</a>
    </p>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly ctx = inject(ContextStore);
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService);
  readonly returnUrl = input<string>();
  readonly suspended = input<string>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signIn(email.trim(), password);
      await this.ctx.load();
      const pref = this.ctx.profile()?.locale;
      if (pref && pref !== this.locale.current()) await this.locale.set(pref, false);
      const target = this.returnUrl() || (this.ctx.organizations().length || !this.ctx.isPlatform() ? '/dashboard' : '/admin');
      await this.router.navigateByUrl(target);
    } catch (e) {
      this.error.set(errorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
