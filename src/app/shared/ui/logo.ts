import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Brand mark: a capulana diamond (flag yellow over black) with a check, on flag green. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5' },
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#0d7744" />
      <path d="M0 30 L10 40 H0 Z" fill="#c0102b" />
      <path d="M40 30 L30 40 H40 Z" fill="#c0102b" />
      <path d="M20 5 L35 20 L20 35 L5 20 Z" fill="#fcd116" />
      <path d="M20 10 L30 20 L20 30 L10 20 Z" fill="#141414" />
      <path d="M15.5 20.5 L19 24 L25 16.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    @if (withText()) {
      <span class="leading-tight">
        <span class="block font-semibold tracking-tight" [class]="dark() ? 'text-white' : 'text-ink'">Checklist Legal</span>
        <span class="block text-[11px] font-medium uppercase tracking-[0.14em]" [class]="dark() ? 'text-sun-300' : 'text-brand-700'">Moçambique</span>
      </span>
    }
  `,
})
export class Logo {
  readonly size = input(32);
  readonly withText = input(true);
  readonly dark = input(false);
}
