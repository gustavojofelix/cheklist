import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight text-ink">{{ title() }}</h1>
        <div class="mz-rule" aria-hidden="true"><span></span><span></span><span></span></div>
        @if (subtitle()) { <p class="mt-2 text-sm text-slate-600">{{ subtitle() }}</p> }
      </div>
      <div class="flex flex-wrap items-center gap-2"><ng-content /></div>
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>();
}
