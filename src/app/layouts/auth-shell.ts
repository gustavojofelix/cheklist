import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleSwitcher } from '../shared/ui/locale-switcher';
import { Icon } from '../shared/ui/icon';

@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, TranslocoPipe, LocaleSwitcher, Icon],
  template: `
    <div class="grid min-h-screen lg:grid-cols-2">
      <div class="flex flex-col px-4 py-6 sm:px-10">
        <header class="flex items-center justify-between">
          <div class="flex items-center gap-2 font-semibold text-slate-900">
            <span class="grid size-8 place-items-center rounded-lg bg-brand-600 text-white"><app-icon name="check" [size]="18" /></span>
            Checklist Legal
          </div>
          <app-locale-switcher />
        </header>
        <main class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <router-outlet />
        </main>
        <footer class="text-xs text-slate-500">© {{ year }} Checklist Legal</footer>
      </div>
      <aside class="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 to-slate-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <p class="text-sm font-medium uppercase tracking-widest text-brand-100">{{ 'auth.hero.kicker' | transloco }}</p>
        <div>
          <h2 class="text-3xl font-semibold leading-tight">{{ 'auth.hero.title' | transloco }}</h2>
          <p class="mt-4 max-w-md text-brand-100">{{ 'auth.hero.body' | transloco }}</p>
          <ul class="mt-8 space-y-3 text-sm">
            @for (k of ['versions', 'documents', 'roles']; track k) {
              <li class="flex items-center gap-2"><app-icon name="check" [size]="16" /> {{ 'auth.hero.' + k | transloco }}</li>
            }
          </ul>
        </div>
        <p class="text-xs text-brand-100">{{ 'auth.hero.footer' | transloco }}</p>
      </aside>
    </div>
  `,
})
export class AuthShell {
  protected readonly year = new Date().getFullYear();
}
