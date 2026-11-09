import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { LocaleService, Lang } from '../../core/i18n';
import { Icon } from './icon';

@Component({
  selector: 'app-locale-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenuTrigger, CdkMenu, CdkMenuItem, Icon],
  template: `
    <button type="button" class="btn-ghost !px-2 !py-1.5" [cdkMenuTriggerFor]="menu" aria-label="Idioma / Language">
      <app-icon name="globe" [size]="16" /> <span class="text-xs font-semibold uppercase">{{ lang() }}</span>
    </button>
    <ng-template #menu>
      <div cdkMenu class="min-w-36 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg">
        @for (l of langs; track l.code) {
          <button cdkMenuItem type="button" (cdkMenuItemTriggered)="choose(l.code)"
                  class="flex w-full items-center justify-between rounded px-3 py-1.5 text-left hover:bg-slate-100">
            {{ l.label }} @if (lang() === l.code) { <span class="text-brand-600">✓</span> }
          </button>
        }
      </div>
    </ng-template>
  `,
})
export class LocaleSwitcher {
  private readonly locale = inject(LocaleService);
  protected readonly lang = signal<Lang>(this.locale.current());
  protected readonly langs: { code: Lang; label: string }[] = [
    { code: 'pt', label: 'Português' },
    { code: 'en', label: 'English' },
  ];

  protected async choose(code: Lang): Promise<void> {
    this.lang.set(code);
    await this.locale.set(code);
  }
}
