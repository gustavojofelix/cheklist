import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PageHeader } from '../../shared/ui/page-header';

/** Screens scheduled for a later build iteration. */
@Component({
  selector: 'app-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, PageHeader],
  template: `
    <app-page-header [title]="'nav.' + feature() | transloco" />
    <div class="card p-10 text-center text-slate-600">
      <p>{{ 'placeholder.body' | transloco: { n: iteration() } }}</p>
    </div>
  `,
})
export class PlaceholderPage {
  readonly feature = input('reports');
  readonly iteration = input(4);
}
