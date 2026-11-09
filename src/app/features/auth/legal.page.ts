import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Terms & Privacy — placeholder text until the firm supplies the final documents. */
@Component({
  selector: 'app-legal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink],
  template: `
    <h1 class="text-2xl font-semibold text-slate-900">{{ 'legal.' + doc() + '.title' | transloco }}</h1>
    <p class="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600">{{ 'legal.' + doc() + '.body' | transloco }}</p>
    <a routerLink="/login" class="btn-secondary mt-6">{{ 'common.back' | transloco }}</a>
  `,
})
export class LegalPage {
  readonly doc = input<'terms' | 'privacy'>('terms');
}
