import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PageHeader } from '../../shared/ui/page-header';
import { AuditTable } from '../audit/audit-table';

@Component({
  selector: 'app-admin-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, PageHeader, AuditTable],
  template: `
    <app-page-header [title]="'admin.nav.audit' | transloco" [subtitle]="'admin.audit.subtitle' | transloco" />
    <app-audit-table [platform]="true" />
  `,
})
export class AdminAuditPage {}
