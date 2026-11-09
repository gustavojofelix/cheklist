import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';

interface Version { id: string; version_number: number; is_published: boolean; published_at: string | null }
interface TItem {
  id: string; version_id: string; parent_id: string | null; scope: 'headquarters' | 'branch'; is_category: boolean;
  catalog_code: string | null; catalog_group: string | null; title: string; translations: { en?: { title?: string } };
  has_validity: boolean; requires_attachment: boolean; applicability: 'yes' | 'depends' | 'no'; sort_order: number;
}

/** Edit the draft version of a template (published versions are read-only snapshots), then publish. */
@Component({
  selector: 'app-admin-template-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslocoPipe, DatePipe, Icon],
  template: `
    <nav class="mb-2 text-sm text-slate-600"><a routerLink="/admin/templates" class="hover:underline">{{ 'admin.nav.templates' | transloco }}</a> / {{ name() }}</nav>
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">{{ name() }}</h1>
        <p class="text-sm text-slate-600">{{ (viewing()?.is_published ? 'admin.tpl.readOnlySnapshot' : 'admin.tpl.editingDraft') | transloco: { n: viewing()?.version_number } }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <select class="input !w-48" [ngModel]="viewing()?.id" (ngModelChange)="view($event)" [attr.aria-label]="'admin.tpl.version' | transloco">
          @for (v of versions(); track v.id) {
            <option [value]="v.id">v{{ v.version_number }} — {{ (v.is_published ? 'admin.tpl.published' : 'admin.tpl.draft') | transloco }}</option>
          }
        </select>
        @if (!draft()) { <button type="button" class="btn-secondary" (click)="newDraft()"><app-icon name="pencil" [size]="16" /> {{ 'admin.tpl.newDraft' | transloco }}</button> }
        @if (editable()) { <button type="button" class="btn-primary" (click)="publish()"><app-icon name="check" [size]="16" /> {{ 'admin.tpl.publish' | transloco }}</button> }
      </div>
    </div>

    <div class="mb-4 flex gap-1 border-b border-slate-200" role="tablist">
      @for (s of scopes; track s) {
        <button type="button" role="tab" (click)="scope.set(s)" [attr.aria-selected]="scope() === s"
                class="-mb-px border-b-2 px-3 py-2 text-sm font-medium" [class]="scope() === s ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600'">
          {{ 'admin.tpl.scope.' + s | transloco }}</button>
      }
    </div>
    @if (scope() === 'branch' && !tree().length) { <p class="mb-4 text-sm text-slate-600">{{ 'admin.tpl.branchFallback' | transloco }}</p> }

    @for (c of tree(); track c.cat.id; let ci = $index) {
      <section class="card mb-4 overflow-hidden">
        <header class="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
          @if (editable()) {
            <input class="input !py-1 font-semibold" [ngModel]="c.cat.title" (change)="save(c.cat, { title: $any($event.target).value, catalog_group: $any($event.target).value })" [attr.aria-label]="'admin.tpl.category' | transloco" />
            <input class="input !w-56 !py-1" [ngModel]="c.cat.translations.en?.title" (change)="saveEn(c.cat, $any($event.target).value)" placeholder="EN" aria-label="English title" />
            <button type="button" class="btn-ghost !p-1" (click)="move(c.cat, -1)" aria-label="Up">↑</button>
            <button type="button" class="btn-ghost !p-1" (click)="move(c.cat, 1)" aria-label="Down">↓</button>
            <button type="button" class="btn-ghost !p-1 text-red-600" (click)="remove(c.cat)" [attr.aria-label]="'common.remove' | transloco"><app-icon name="trash" [size]="14" /></button>
          } @else {
            <h2 class="font-semibold">{{ ci + 1 }}. {{ c.cat.title }}</h2>
          }
        </header>
        <div class="overflow-x-auto">
          <table class="table-base">
            <thead><tr><th class="w-28">ID</th><th>{{ 'ficha.item' | transloco }}</th><th>EN</th><th>{{ 'ficha.validity' | transloco }}</th>
              <th>{{ 'ficha.attachment' | transloco }}</th><th>{{ 'admin.tpl.applicability' | transloco }}</th>@if (editable()) {<th></th>}</tr></thead>
            <tbody>
              @for (it of c.items; track it.id) {
                <tr>
                  @if (editable()) {
                    <td><input class="input !py-1 font-mono text-xs" [ngModel]="it.catalog_code" (change)="save(it, { catalog_code: $any($event.target).value.trim().toUpperCase() || null })" aria-label="ID" /></td>
                    <td><input class="input !py-1" [ngModel]="it.title" (change)="save(it, { title: $any($event.target).value })" [attr.aria-label]="'ficha.item' | transloco" /></td>
                    <td><input class="input !py-1" [ngModel]="it.translations.en?.title" (change)="saveEn(it, $any($event.target).value)" aria-label="English title" /></td>
                    <td><input type="checkbox" [checked]="it.has_validity" (change)="save(it, { has_validity: $any($event.target).checked })" [attr.aria-label]="'ficha.validity' | transloco" /></td>
                    <td><input type="checkbox" [checked]="it.requires_attachment" (change)="save(it, { requires_attachment: $any($event.target).checked })" [attr.aria-label]="'ficha.attachment' | transloco" /></td>
                    <td><select class="input !w-32 !py-1" [ngModel]="it.applicability" (ngModelChange)="save(it, { applicability: $event })" [attr.aria-label]="'admin.tpl.applicability' | transloco">
                      @for (a of ['yes', 'depends']; track a) { <option [value]="a">{{ 'admin.tpl.app.' + a | transloco }}</option> }</select></td>
                    <td class="whitespace-nowrap">
                      <button type="button" class="btn-ghost !p-1" (click)="move(it, -1)" aria-label="Up">↑</button>
                      <button type="button" class="btn-ghost !p-1" (click)="move(it, 1)" aria-label="Down">↓</button>
                      <button type="button" class="btn-ghost !p-1 text-red-600" (click)="remove(it)" [attr.aria-label]="'common.remove' | transloco"><app-icon name="trash" [size]="14" /></button>
                    </td>
                  } @else {
                    <td class="font-mono text-xs text-brand-700">{{ it.catalog_code }}</td><td>{{ it.title }}</td><td class="text-slate-600">{{ it.translations.en?.title }}</td>
                    <td>{{ it.has_validity ? '✓' : '' }}</td><td>{{ it.requires_attachment ? '✓' : '' }}</td><td>{{ 'admin.tpl.app.' + it.applicability | transloco }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (editable()) {
          <div class="border-t border-slate-100 p-2"><button type="button" class="btn-ghost text-sm" (click)="addItem(c.cat)"><app-icon name="plus" [size]="14" /> {{ 'ficha.addItem' | transloco }}</button></div>
        }
      </section>
    }
    @if (editable()) {
      <button type="button" class="btn-secondary" (click)="addCategory()"><app-icon name="plus" [size]="16" /> {{ 'ficha.addCategory' | transloco }}</button>
    }

    <section class="card mt-8 p-4">
      <h2 class="font-semibold">{{ 'admin.tpl.history' | transloco }}</h2>
      <ul class="mt-2 text-sm">
        @for (v of versions(); track v.id) {
          <li class="py-1">v{{ v.version_number }} · {{ (v.is_published ? 'admin.tpl.published' : 'admin.tpl.draft') | transloco }}
            @if (v.published_at) { · {{ v.published_at | date: 'dd/MM/yyyy HH:mm' }} }</li>
        }
      </ul>
    </section>
  `,
})
export class AdminTemplateEditorPage {
  readonly id = input.required<string>();
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly scopes = ['headquarters', 'branch'] as const;
  protected readonly name = signal('');
  protected readonly versions = signal<Version[]>([]);
  protected readonly viewingId = signal<string | null>(null);
  protected readonly items = signal<TItem[]>([]);
  protected readonly scope = signal<'headquarters' | 'branch'>('headquarters');

  protected readonly draft = computed(() => this.versions().find((v) => !v.is_published) ?? null);
  protected readonly viewing = computed(() => this.versions().find((v) => v.id === this.viewingId()) ?? null);
  protected readonly editable = computed(() => !!this.viewing() && !this.viewing()!.is_published);
  protected readonly tree = computed(() => {
    const all = this.items().filter((i) => i.scope === this.scope());
    return all.filter((i) => i.is_category && !i.parent_id).sort((a, b) => a.sort_order - b.sort_order)
      .map((cat) => ({ cat, items: all.filter((i) => i.parent_id === cat.id).sort((a, b) => a.sort_order - b.sort_order) }));
  });

  constructor() {
    effect(() => { void this.load(this.id()); });
  }

  private async load(id: string, keepVersion = false): Promise<void> {
    const { data } = await this.sb.client.from('checklist_templates')
      .select('name, template_versions(id, version_number, is_published, published_at)').eq('id', id).single();
    const t = data as { name: string; template_versions: Version[] } | null;
    this.name.set(t?.name ?? '');
    const vs = (t?.template_versions ?? []).sort((a, b) => b.version_number - a.version_number);
    this.versions.set(vs);
    if (!keepVersion || !vs.some((v) => v.id === this.viewingId())) this.viewingId.set((vs.find((v) => !v.is_published) ?? vs[0])?.id ?? null);
    await this.loadItems();
  }

  private async loadItems(): Promise<void> {
    const v = this.viewingId();
    if (!v) { this.items.set([]); return; }
    const { data } = await this.sb.client.from('template_items').select('*').eq('version_id', v).order('sort_order');
    this.items.set((data ?? []) as TItem[]);
  }

  protected async view(versionId: string): Promise<void> { this.viewingId.set(versionId); await this.loadItems(); }

  protected async newDraft(): Promise<void> {
    await this.run(async () => {
      this.viewingId.set(await this.sb.rpc<string>('template_draft', { p_template: this.id() }));
      await this.load(this.id(), true);
    });
  }

  protected async publish(): Promise<void> {
    const v = this.viewing();
    if (!v || !(await this.confirm.ask({ title: 'admin.tpl.publishTitle', body: 'admin.tpl.publishBody', params: { n: v.version_number } }))) return;
    await this.run(async () => {
      await this.sb.rpc('template_publish', { p_version: v.id });
      this.toast.success('admin.tpl.publishedToast');
      await this.load(this.id(), true);
    });
  }

  protected async save(it: TItem, changes: Partial<TItem>): Promise<void> {
    await this.run(async () => {
      const { error } = await this.sb.client.from('template_items').update(changes).eq('id', it.id);
      if (error) throw error;
      await this.loadItems();
    });
  }

  protected saveEn(it: TItem, value: string): Promise<void> {
    const en = { ...(it.translations.en ?? {}), title: value.trim() || undefined };
    return this.save(it, { translations: { ...it.translations, en } });
  }

  protected async addCategory(): Promise<void> {
    const max = Math.max(0, ...this.tree().map((c) => c.cat.sort_order));
    await this.insert({ is_category: true, title: 'Nova categoria', catalog_group: 'Nova categoria', sort_order: max + 1 });
  }

  protected async addItem(cat: TItem): Promise<void> {
    const siblings = this.items().filter((i) => i.parent_id === cat.id);
    await this.insert({ parent_id: cat.id, title: 'Novo item', catalog_group: cat.catalog_group,
                        sort_order: Math.max(0, ...siblings.map((s) => s.sort_order)) + 1 });
  }

  private async insert(row: Partial<TItem>): Promise<void> {
    await this.run(async () => {
      const { error } = await this.sb.client.from('template_items').insert({ version_id: this.viewingId(), scope: this.scope(), ...row });
      if (error) throw error;
      await this.loadItems();
    });
  }

  protected async move(it: TItem, dir: -1 | 1): Promise<void> {
    const siblings = this.items().filter((i) => i.parent_id === it.parent_id && i.scope === it.scope && i.is_category === it.is_category)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((s) => s.id === it.id);
    const other = siblings[idx + dir];
    if (!other) return;
    await this.run(async () => {
      await this.sb.client.from('template_items').update({ sort_order: other.sort_order }).eq('id', it.id);
      await this.sb.client.from('template_items').update({ sort_order: it.sort_order === other.sort_order ? it.sort_order + dir : it.sort_order }).eq('id', other.id);
      await this.loadItems();
    });
  }

  protected async remove(it: TItem): Promise<void> {
    if (!(await this.confirm.ask({ title: it.is_category ? 'ficha.removeCategory' : 'ficha.removeItem', danger: true, confirm: 'common.remove' }))) return;
    await this.run(async () => {
      const { error } = await this.sb.client.from('template_items').delete().eq('id', it.id);
      if (error) throw error;
      await this.loadItems();
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    try { await fn(); } catch (e) { this.toast.error(errorKey(e)); }
  }
}
