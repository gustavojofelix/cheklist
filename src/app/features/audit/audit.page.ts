import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { PageHeader } from '../../shared/ui/page-header';
import { AuditTable } from './audit-table';

@Component({
  selector: 'app-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, PageHeader, AuditTable],
  template: `
    <app-page-header [title]="'nav.audit' | transloco" [subtitle]="'audit.subtitle' | transloco" />
    @if (ctx.active(); as org) { <app-audit-table [orgId]="org.id" /> }
  `,
})
export class AuditPage {
  protected readonly ctx = inject(ContextStore);
}
