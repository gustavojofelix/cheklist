import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth.service';
import { errorKey } from '../../core/errors';
import { LocaleService } from '../../core/i18n';
import { OrgFields, orgForm } from '../../shared/ui/org-fields';
import { errorOf, phone9, sameAs } from '../../shared/validators';

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, OrgFields],
  template: `
    @if (done()) {
      <div class="card p-6 text-center">
        <h1 class="text-xl font-semibold text-slate-900">{{ 'auth.register.doneTitle' | transloco }}</h1>
        <p class="mt-2 text-sm text-slate-600">{{ 'auth.register.doneBody' | transloco }}</p>
        <a routerLink="/login" class="btn-primary mt-6">{{ 'auth.login.submit' | transloco }}</a>
      </div>
    } @else {
      <h1 class="text-2xl font-semibold text-slate-900">{{ 'auth.register.title' | transloco }}</h1>
      <p class="mt-1 text-sm text-slate-600">{{ 'auth.register.subtitle' | transloco }}</p>
      <ol class="mt-6 flex gap-2 text-xs font-medium">
        @for (s of [1, 2]; track s) {
          <li class="flex-1 rounded-full py-1 text-center" [class]="step() >= s ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600'">
            {{ 'auth.register.step' + s | transloco }}
          </li>
        }
      </ol>
      @if (error()) { <p class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error()! | transloco }}</p> }

      @if (step() === 1) {
        <form class="mt-6 space-y-4" [formGroup]="person" (ngSubmit)="next()" novalidate>
          <div>
            <label class="label" for="r-name">{{ 'auth.fullName' | transloco }} *</label>
            <input id="r-name" class="input" formControlName="full_name" autocomplete="name" [class.invalid]="err(person, 'full_name')" />
            @if (err(person, 'full_name'); as e) { <p class="field-error">{{ e | transloco }}</p> }
          </div>
          <div>
            <label class="label" for="r-email">{{ 'auth.email' | transloco }} *</label>
            <input id="r-email" type="email" class="input" formControlName="email" autocomplete="email" [class.invalid]="err(person, 'email')" />
            @if (err(person, 'email'); as e) { <p class="field-error">{{ e | transloco }}</p> }
          </div>
          <div>
            <label class="label" for="r-phone">{{ 'auth.phone' | transloco }}</label>
            <div class="flex gap-2">
              <span class="input !w-20 text-center text-slate-600">+258</span>
              <input id="r-phone" class="input" formControlName="phone_number" inputmode="tel" maxlength="9" placeholder="84xxxxxxx" [class.invalid]="err(person, 'phone_number')" />
            </div>
            @if (err(person, 'phone_number'); as e) { <p class="field-error">{{ e | transloco }}</p> }
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="r-pw">{{ 'auth.password' | transloco }} *</label>
              <input id="r-pw" type="password" class="input" formControlName="password" autocomplete="new-password" [class.invalid]="err(person, 'password')" />
              @if (err(person, 'password'); as e) { <p class="field-error">{{ e | transloco: { min: 8 } }}</p> }
            </div>
            <div>
              <label class="label" for="r-pw2">{{ 'auth.confirmPassword' | transloco }} *</label>
              <input id="r-pw2" type="password" class="input" formControlName="password_confirmation" autocomplete="new-password" [class.invalid]="err(person, 'password_confirmation')" />
              @if (err(person, 'password_confirmation'); as e) { <p class="field-error">{{ e | transloco }}</p> }
            </div>
          </div>
          <label class="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" class="mt-0.5" formControlName="accepted_terms" />
            <span>{{ 'auth.register.accept' | transloco }}
              <a routerLink="/terms" target="_blank" class="text-brand-600 underline">{{ 'auth.terms' | transloco }}</a> {{ 'common.and' | transloco }}
              <a routerLink="/privacy" target="_blank" class="text-brand-600 underline">{{ 'auth.privacy' | transloco }}</a></span>
          </label>
          @if (err(person, 'accepted_terms'); as e) { <p class="field-error">{{ 'auth.register.mustAccept' | transloco }}</p> }
          <button type="submit" class="btn-primary w-full">{{ 'common.next' | transloco }}</button>
        </form>
      } @else {
        <form class="mt-6 space-y-4" [formGroup]="org" (ngSubmit)="submit()" novalidate>
          <app-org-fields [form]="org" />
          <div class="flex gap-2">
            <button type="button" class="btn-secondary" (click)="step.set(1)">{{ 'common.back' | transloco }}</button>
            <button type="submit" class="btn-primary flex-1" [disabled]="busy()">
              {{ (busy() ? 'common.wait' : 'auth.register.submit') | transloco }}
            </button>
          </div>
        </form>
      }
      <p class="mt-6 text-center text-sm text-slate-600">
        {{ 'auth.register.already' | transloco }} <a routerLink="/login" class="font-medium text-brand-600 hover:underline">{{ 'auth.login.submit' | transloco }}</a>
      </p>
    }
  `,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly locale = inject(LocaleService);
  protected readonly step = signal(1);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly person = this.fb.nonNullable.group({
    full_name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    phone_number: ['', phone9],
    password: ['', [Validators.required, Validators.minLength(8)]],
    password_confirmation: ['', [Validators.required, sameAs('password')]],
    accepted_terms: [false, Validators.requiredTrue],
  });
  protected readonly org = orgForm(this.fb);

  protected err(g: { get(n: string): import('@angular/forms').AbstractControl | null }, n: string): string | null {
    return errorOf(g.get(n));
  }

  protected next(): void {
    this.person.markAllAsTouched();
    this.person.controls.password_confirmation.updateValueAndValidity();
    if (this.person.invalid) return;
    if (!this.org.get('email')!.value) this.org.patchValue({ email: this.person.controls.email.value });
    this.step.set(2);
  }

  protected async submit(): Promise<void> {
    this.org.markAllAsTouched();
    if (this.org.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const p = this.person.getRawValue();
      const res = await this.auth.signUp({
        email: p.email.trim(), password: p.password, fullName: p.full_name.trim(),
        phoneCountry: 'MZ', phoneNumber: p.phone_number, locale: this.locale.current(),
        organization: this.org.getRawValue(),
      });
      this.done.set(true);
      void res;
    } catch (e) {
      this.error.set(errorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
