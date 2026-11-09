import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth.service';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { LocaleService } from '../../core/i18n';
import { Supabase } from '../../core/supabase';
import { errorOf, sameAs } from '../../shared/validators';

interface Preview { organization: string; email: string; role: string; status: 'open' | 'expired' | 'invalid' }

/** Accept an invitation: sign up (if new) or accept with the signed-in account. */
@Component({
  selector: 'app-invite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  template: `
    @if (loading()) {
      <p class="text-sm text-slate-600">{{ 'common.loading' | transloco }}</p>
    } @else if (!preview() || preview()!.status !== 'open') {
      <h1 class="text-xl font-semibold">{{ 'auth.invite.unavailable' | transloco }}</h1>
      <p class="mt-2 text-sm text-slate-600">{{ ('auth.invite.' + (preview()?.status ?? 'invalid')) | transloco }}</p>
      <a routerLink="/login" class="btn-secondary mt-6">{{ 'auth.login.submit' | transloco }}</a>
    } @else {
      <h1 class="text-2xl font-semibold text-slate-900">{{ 'auth.invite.title' | transloco: { org: preview()!.organization } }}</h1>
      <p class="mt-1 text-sm text-slate-600">
        {{ 'auth.invite.as' | transloco: { email: preview()!.email, role: ('roles.' + preview()!.role | transloco) } }}
      </p>
      @if (error()) { <p class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ error()! | transloco }}</p> }
      @if (sent()) {
        <p class="mt-6 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{{ 'auth.invite.confirmEmail' | transloco }}</p>
      } @else if (auth.session()) {
        <button type="button" class="btn-primary mt-6 w-full" [disabled]="busy()" (click)="accept()">{{ 'auth.invite.accept' | transloco }}</button>
      } @else {
        <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="signUp()" novalidate>
          <div>
            <label class="label" for="i-name">{{ 'auth.fullName' | transloco }}</label>
            <input id="i-name" class="input" formControlName="full_name" />
          </div>
          <div>
            <label class="label" for="i-pw">{{ 'auth.password' | transloco }}</label>
            <input id="i-pw" type="password" class="input" formControlName="password" autocomplete="new-password" />
            @if (e('password'); as k) { <p class="field-error">{{ k | transloco: { min: 8 } }}</p> }
          </div>
          <div>
            <label class="label" for="i-pw2">{{ 'auth.confirmPassword' | transloco }}</label>
            <input id="i-pw2" type="password" class="input" formControlName="confirm" autocomplete="new-password" />
            @if (e('confirm'); as k) { <p class="field-error">{{ k | transloco }}</p> }
          </div>
          <label class="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" class="mt-0.5" formControlName="accepted_terms" />
            <span>{{ 'auth.register.accept' | transloco }} <a routerLink="/terms" class="text-brand-600 underline">{{ 'auth.terms' | transloco }}</a>
              {{ 'common.and' | transloco }} <a routerLink="/privacy" class="text-brand-600 underline">{{ 'auth.privacy' | transloco }}</a></span>
          </label>
          <button type="submit" class="btn-primary w-full" [disabled]="busy() || form.invalid">{{ 'auth.invite.createAndAccept' | transloco }}</button>
          <p class="text-center text-sm text-slate-600">{{ 'auth.invite.haveAccount' | transloco }}
            <a [routerLink]="['/login']" [queryParams]="{ returnUrl: '/invite/' + token() }" class="text-brand-600 hover:underline">{{ 'auth.login.submit' | transloco }}</a></p>
        </form>
      }
    }
  `,
})
export class InvitePage implements OnInit {
  readonly token = input.required<string>();
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(Supabase);
  private readonly ctx = inject(ContextStore);
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly preview = signal<Preview | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    full_name: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required, sameAs('password')]],
    accepted_terms: [false, Validators.requiredTrue],
  });

  async ngOnInit(): Promise<void> {
    await this.auth.whenReady();
    try {
      this.preview.set(await this.sb.rpc<Preview | null>('invitation_preview', { token: this.token() }));
    } finally {
      this.loading.set(false);
    }
  }

  protected e(n: string): string | null { return errorOf(this.form.get(n)); }

  protected async accept(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const orgId = await this.sb.rpc<string>('accept_invitation', { token: this.token() });
      await this.ctx.load();
      this.ctx.setActive(this.ctx.organizations().find((o) => o.id === orgId)?.parent_id ?? orgId);
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.error.set(errorKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async signUp(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const v = this.form.getRawValue();
      const res = await this.auth.signUp({
        email: this.preview()!.email, password: v.password, fullName: v.full_name.trim(),
        phoneCountry: 'MZ', phoneNumber: '', locale: this.locale.current(), invitationToken: this.token(),
      });
      if (res.needsConfirmation) this.sent.set(true);
      else await this.accept();
    } catch (err) {
      this.error.set(errorKey(err));
    } finally {
      this.busy.set(false);
    }
  }
}
