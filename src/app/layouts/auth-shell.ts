import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleSwitcher } from '../shared/ui/locale-switcher';
import { Icon } from '../shared/ui/icon';
import { Logo } from '../shared/ui/logo';

@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, TranslocoPipe, LocaleSwitcher, Icon, Logo],
  template: `
    <div class="mz-stripe h-1.5"></div>
    <div class="grid min-h-[calc(100vh-6px)] lg:grid-cols-[1fr_1.05fr]">
      <div class="flex flex-col px-4 py-6 sm:px-10">
        <header class="flex items-center justify-between">
          <app-logo [size]="36" />
          <app-locale-switcher />
        </header>
        <main class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <router-outlet />
        </main>
        <footer class="flex items-center gap-2 text-xs text-slate-600">
          <span class="mz-rule !mt-0 !w-8"><span></span><span></span><span></span></span>
          © {{ year }} Checklist Legal · {{ 'auth.hero.madeIn' | transloco }}
        </footer>
      </div>

      <!-- capulana panel -->
      <aside class="capulana relative hidden overflow-hidden lg:block">
        <div class="absolute inset-0 bg-gradient-to-br from-brand-900/90 via-brand-800/55 to-ink/85"></div>
        <div class="absolute inset-0 bg-gradient-to-b from-transparent via-brand-900/80 to-transparent"></div>
        <div class="relative flex h-full flex-col justify-between p-12 text-white">
          <p class="inline-flex w-fit items-center gap-2 rounded-full bg-sun-400 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-ink">
            {{ 'auth.hero.kicker' | transloco }}
          </p>
          <div>
            <h2 class="max-w-lg text-4xl font-semibold leading-tight">{{ 'auth.hero.title' | transloco }}</h2>
            <p class="mt-4 max-w-md text-base text-brand-100">{{ 'auth.hero.body' | transloco }}</p>
            <ul class="mt-8 space-y-3 text-sm">
              @for (k of ['versions', 'documents', 'roles']; track k) {
                <li class="flex items-center gap-3">
                  <span class="grid size-6 place-items-center rounded-md bg-sun-400 text-ink"><app-icon name="check" [size]="14" /></span>
                  {{ 'auth.hero.' + k | transloco }}
                </li>
              }
            </ul>
          </div>
          <div class="rounded-xl border border-white/15 bg-black/30 p-4 backdrop-blur-sm">
            <p class="text-sm text-brand-100">{{ 'auth.hero.quote' | transloco }}</p>
            <p class="mt-2 text-xs font-semibold uppercase tracking-widest text-sun-300">{{ 'auth.hero.footer' | transloco }}</p>
          </div>
        </div>
      </aside>
    </div>
  `,
})
export class AuthShell {
  protected readonly year = new Date().getFullYear();
}
