import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth.service';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { OrgFields, orgForm } from '../../shared/ui/org-fields';

/** Signed-in user without an organization creates their entity (starts the trial). */
@Component({
  selector: 'app-onboarding',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, OrgFields],
  template: `
    <h1 class="text-2xl font-semibold text-slate-900">{{ 'auth.onboarding.title' | transloco }}</h1>
    <p class="mt-1 text-sm text-slate-500">{{ 'auth.onboarding.subtitle' | transloco }}</p>
    @if (error()) { <p class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ error()! | transloco }}</p> }
    <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <app-org-fields [form]="form" />
      <button type="submit" class="btn-primary w-full" [disabled]="busy()">{{ 'auth.onboarding.submit' | transloco }}</button>
      <button type="button" class="btn-ghost w-full" (click)="logout()">{{ 'auth.logout' | transloco }}</button>
    </form>
  `,
})
export class OnboardingPage {
  private readonly sb = inject(Supabase);
  private readonly ctx = inject(ContextStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = orgForm(inject(FormBuilder));

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const id = await this.sb.rpc<string>('create_organization', { payload: this.form.getRawValue() });
      await this.ctx.load();
      this.ctx.setActive(id);
      await this.router.navigateByUrl('/dashboard');
    } catch (e) {
      this.error.set(errorKey(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.signOut();
    this.ctx.reset();
    await this.router.navigateByUrl('/login');
  }
}
