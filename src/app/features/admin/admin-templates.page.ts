import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorKey } from '../../core/errors';
import { ReferenceService } from '../../core/reference.service';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';

interface Tpl {
  id: string; name: string; sector: string | null; status: string; organization_id: string | null;
  template_versions: { id: string; version_number: number; is_published: boolean }[];
  orgs: number;
}

/** Back office: checklist templates published per sector (plus entity-specific copies). */
@Component({
  selector: 'app-admin-templates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslocoPipe, PageHeader, Icon],
  template: `
    <app-page-header [title]="'admin.nav.templates' | transloco" [subtitle]="'admin.tpl.subtitle' | transloco">
      <button type="button" class="btn-primary" (click)="creating.set(!creating())"><app-icon name="plus" [size]="16" /> {{ 'admin.tpl.new' | transloco }}</button>
    </app-page-header>
    @if (creating()) {
      <form class="card mb-4 flex flex-wrap items-end gap-3 p-4" (ngSubmit)="create()">
        <label class="flex-1 text-sm">{{ 'common.name' | transloco }}<input class="input mt-1" name="name" [(ngModel)]="name" required /></label>
        <label class="w-72 text-sm">{{ 'org.sector' | transloco }}
          <select class="input mt-1" name="sector" [(ngModel)]="sector">
            <option value="">{{ 'admin.tpl.allSectors' | transloco }}</option>
            @for (o of refs.options('sector'); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></label>
        <button class="btn-primary" type="submit" [disabled]="!name.trim()">{{ 'common.create' | transloco }}</button>
      </form>
    }
    <div class="card overflow-x-auto">
      <table class="table-base">
        <thead><tr><th>{{ 'admin.tpl.template' | transloco }}</th><th>{{ 'org.sector' | transloco }}</th><th>{{ 'admin.tpl.version' | transloco }}</th>
          <th>{{ 'admin.tpl.orgsOnTemplate' | transloco }}</th><th>{{ 'common.status' | transloco }}</th><th></th></tr></thead>
        <tbody>
          @for (t of rows(); track t.id) {
            <tr>
              <td class="font-medium">{{ t.name }} @if (t.organization_id) { <span class="chip bg-violet-100 text-violet-800">{{ 'admin.tpl.entitySpecific' | transloco }}</span> }</td>
              <td class="text-slate-500">{{ t.sector ? refs.label('sector', t.sector) : ('admin.tpl.allSectors' | transloco) }}</td>
              <td>v{{ published(t) ?? '—' }} @if (hasDraft(t)) { <span class="chip bg-amber-100 text-amber-800">{{ 'admin.tpl.draft' | transloco }}</span> }</td>
              <td>{{ t.orgs }}</td>
              <td><span class="chip bg-slate-100 text-slate-700">{{ 'admin.tpl.status.' + t.status | transloco }}</span></td>
              <td class="text-right"><a class="btn-secondary !py-1" [routerLink]="['/admin/templates', t.id]">{{ 'common.open' | transloco }}</a></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AdminTemplatesPage implements OnInit {
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly refs = inject(ReferenceService);
  protected readonly rows = signal<Tpl[]>([]);
  protected readonly creating = signal(false);
  protected name = '';
  protected sector = '';

  async ngOnInit(): Promise<void> {
    const [{ data }, { data: orgs }] = await Promise.all([
      this.sb.client.from('checklist_templates').select('id, name, sector, status, organization_id, template_versions(id, version_number, is_published)').order('name'),
      this.sb.client.from('organizations').select('template_version_id').not('template_version_id', 'is', null),
    ]);
    const counts = new Map<string, number>();
    for (const o of (orgs ?? []) as { template_version_id: string }[]) counts.set(o.template_version_id, (counts.get(o.template_version_id) ?? 0) + 1);
    this.rows.set(((data ?? []) as Omit<Tpl, 'orgs'>[]).map((t) => ({
      ...t, orgs: t.template_versions.reduce((n, v) => n + (counts.get(v.id) ?? 0), 0) })));
  }

  protected published(t: Tpl): number | null {
    const v = t.template_versions.filter((x) => x.is_published).map((x) => x.version_number);
    return v.length ? Math.max(...v) : null;
  }
  protected hasDraft(t: Tpl): boolean { return t.template_versions.some((v) => !v.is_published); }

  protected async create(): Promise<void> {
    const { data, error } = await this.sb.client.from('checklist_templates')
      .insert({ name: this.name.trim(), sector: this.sector || null, status: 'draft' }).select('id').single();
    if (error) { this.toast.error(errorKey(error)); return; }
    await this.router.navigate(['/admin/templates', data.id]);
  }
}
