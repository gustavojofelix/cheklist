import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export type ComplianceState = 'regular' | 'atencao' | 'critico';

@Component({
  selector: 'app-compliance-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `<span class="chip" [class]="cls()">{{ 'compliance.' + state() | transloco }}</span>`,
})
export class ComplianceChip {
  readonly state = input.required<ComplianceState>();
  protected readonly cls = computed(() => ({
    regular: 'bg-emerald-100 text-emerald-800',
    atencao: 'bg-amber-100 text-amber-800',
    critico: 'bg-red-100 text-red-800',
  })[this.state()]);
}
