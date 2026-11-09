import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RealtimeChannel } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { ReferenceService } from '../../core/reference.service';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { ComplianceChip } from '../../shared/ui/compliance-chip';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { AddDocumentDialog, AddDocumentData } from './add-document.dialog';
import { Category, FichaDocument, FichaItem } from './ficha.types';

@Component({
  selector: 'app-ficha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslocoPipe, Icon, ComplianceChip],
  template: `
    <nav class="mb-2 text-sm text-slate-500"><a routerLink="/entities" class="hover:underline">{{ 'nav.entities' | transloco }}</a> / {{ orgName() }}</nav>
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">{{ 'ficha.title' | transloco: { name: orgName() } }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ 'ficha.summary' | transloco: { items: itemCount(), categories: categories().length } }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        @if (canManage()) {
          <button type="button" class="btn-secondary" (click)="editMode.set(!editMode())" [attr.aria-pressed]="editMode()">
            <app-icon [name]="editMode() ? 'check' : 'pencil'" [size]="16" /> {{ (editMode() ? 'ficha.done' : 'ficha.edit') | transloco }}</button>
        }
        @if (canWrite()) {
          <button type="button" class="btn-primary" (click)="addDocument()"><app-icon name="plus" [size]="16" /> {{ 'ficha.addDocument' | transloco }}</button>
        }
      </div>
    </div>

    <!-- filters -->
    <div class="card mb-4 flex flex-wrap items-center gap-2 p-3">
      <div class="relative min-w-56 flex-1">
        <span class="pointer-events-none absolute top-2.5 left-2.5 text-slate-400"><app-icon name="search" [size]="16" /></span>
        <input class="input !pl-8" [(ngModel)]="search" [placeholder]="'ficha.search' | transloco" [attr.aria-label]="'ficha.search' | transloco" />
      </div>
      <select class="input !w-40" [(ngModel)]="stateFilter" [attr.aria-label]="'ficha.state' | transloco">
        <option value="">{{ 'ficha.allStates' | transloco }}</option>
        @for (s of ['regular', 'atencao', 'critico']; track s) { <option [value]="s">{{ 'compliance.' + s | transloco }}</option> }
      </select>
      <label class="flex items-center gap-1.5 text-sm"><input type="checkbox" [(ngModel)]="onlyValidity" /> {{ 'ficha.validity' | transloco }}</label>
      <label class="flex items-center gap-1.5 text-sm"><input type="checkbox" [(ngModel)]="onlyAttachment" /> {{ 'ficha.attachment' | transloco }}</label>
      <button type="button" class="btn-ghost" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
    </div>

    @if (loading()) {
      <p class="py-12 text-center text-slate-400">{{ 'common.loading' | transloco }}</p>
    }

    @for (cat of visible(); track cat.item.id; let ci = $index) {
      <section class="card mb-4 overflow-hidden">
        <header class="flex cursor-pointer items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3" (click)="toggleCat(cat.item.id)">
          <span class="transition-transform" [class.-rotate-90]="collapsed().has(cat.item.id)"><app-icon name="chevron" [size]="16" /></span>
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold text-slate-900">{{ ci + 1 }}. {{ tr(cat.item) }}</h2>
            <p class="text-xs text-slate-500">{{ 'ficha.itemsCount' | transloco: { n: cat.children.length } }} · {{ trDesc(cat.item) }}</p>
          </div>
          <div class="hidden w-40 items-center gap-2 sm:flex">
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div class="h-full bg-emerald-500" [style.width.%]="progress(cat)"></div>
            </div>
            <span class="text-xs text-slate-500">{{ regularCount(cat) }}/{{ applicableCount(cat) }}</span>
          </div>
          @if (editMode() && !cat.item.template_item_id) {
            <button type="button" class="btn-ghost !p-1.5 text-red-600" (click)="$event.stopPropagation(); removeItem(cat.item)"
                    [attr.aria-label]="'common.remove' | transloco"><app-icon name="trash" [size]="16" /></button>
          }
        </header>
        @if (!collapsed().has(cat.item.id)) {
          <div class="overflow-x-auto">
            <table class="table-base">
              <thead><tr>
                <th class="w-24">ID</th><th>{{ 'ficha.item' | transloco }}</th><th>{{ 'ficha.descriptive' | transloco }}</th>
                <th class="w-40">{{ 'ficha.validity' | transloco }}</th><th class="w-44">{{ 'ficha.attachment' | transloco }}</th>
                <th class="w-28">{{ 'ficha.state' | transloco }}</th>
                @if (editMode()) { <th class="w-10"></th> }
              </tr></thead>
              <tbody>
                @for (it of cat.children; track it.id) {
                  <tr [class.opacity-50]="!it.is_applicable">
                    <td class="font-mono text-xs text-brand-700">{{ it.catalog_code || '—' }}</td>
                    <td>
                      @if (editMode() && !it.template_item_id) {
                        <input class="input !py-1" [ngModel]="it.title" (change)="patch(it, { title: $any($event.target).value })" [attr.aria-label]="'ficha.item' | transloco" />
                      } @else {
                        <span class="font-medium text-slate-800">{{ tr(it) }}</span>
                      }
                      @if (it.applicability === 'depends') {
                        <label class="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <input type="checkbox" [checked]="it.is_applicable" [disabled]="!canEditItem(it)" (change)="patch(it, { is_applicable: $any($event.target).checked })" />
                          {{ 'ficha.applicable' | transloco }}
                        </label>
                      }
                      @if (editMode()) {
                        <div class="mt-1 flex gap-3 text-xs text-slate-500">
                          <label class="flex items-center gap-1"><input type="checkbox" [checked]="it.has_validity" (change)="patch(it, { has_validity: $any($event.target).checked, due_date: $any($event.target).checked ? it.due_date : null })" /> {{ 'ficha.validity' | transloco }}</label>
                          <label class="flex items-center gap-1"><input type="checkbox" [checked]="it.requires_attachment" (change)="patch(it, { requires_attachment: $any($event.target).checked })" /> {{ 'ficha.attachment' | transloco }}</label>
                        </div>
                      }
                    </td>
                    <td class="min-w-56">
                      @if (it.bound_field) {
                        <span class="text-slate-700">{{ answerDisplay(it) || '—' }}</span>
                        <span class="block text-[11px] text-slate-400">{{ 'ficha.boundHint' | transloco }}</span>
                      } @else if (editingAnswer() === it.id) {
                        <textarea class="input !py-1" rows="2" [ngModel]="it.answer" #ans
                                  (keydown.enter)="$event.preventDefault(); saveAnswer(it, ans.value)" (blur)="saveAnswer(it, ans.value)"
                                  (keydown.escape)="editingAnswer.set(null)" [attr.aria-label]="'ficha.descriptive' | transloco"></textarea>
                      } @else {
                        <button type="button" class="w-full rounded px-1 py-0.5 text-left hover:bg-slate-100 disabled:hover:bg-transparent"
                                [disabled]="!canEditItem(it)" (click)="editingAnswer.set(it.id)">
                          {{ it.answer || '—' }}</button>
                      }
                    </td>
                    <td>
                      @if (it.has_validity) {
                        <input type="date" class="input !py-1" [value]="it.due_date ?? ''" [disabled]="!canEditItem(it)"
                               [class.!border-red-300]="it.is_overdue" (change)="patch(it, { due_date: $any($event.target).value || null })"
                               [attr.aria-label]="'ficha.validity' | transloco" />
                      } @else { <span class="text-slate-300">—</span> }
                    </td>
                    <td>
                      @for (d of docsOf(it.id); track d.id) {
                        <div class="flex items-center gap-1 text-xs">
                          <button type="button" class="truncate text-left text-brand-700 hover:underline" (click)="download(d)" [title]="d.original_name">
                            <app-icon name="file" [size]="12" /> {{ d.original_name }}</button>
                          @if (canWrite()) {
                            <button type="button" class="text-slate-400 hover:text-red-600" (click)="deleteDoc(d)" [attr.aria-label]="'common.delete' | transloco">✕</button>
                          }
                        </div>
                      }
                      @if (it.requires_attachment && canWrite()) {
                        <button type="button" class="btn-ghost !px-2 !py-0.5 text-xs" (click)="addDocument([it.id])">
                          <app-icon name="paperclip" [size]="12" /> {{ 'ficha.attach' | transloco }}</button>
                      }
                    </td>
                    <td><app-compliance-chip [state]="it.compliance_state" /></td>
                    @if (editMode()) {
                      <td>@if (!it.template_item_id) {
                        <button type="button" class="btn-ghost !p-1 text-red-600" (click)="removeItem(it)" [attr.aria-label]="'common.remove' | transloco"><app-icon name="trash" [size]="14" /></button>
                      }</td>
                    }
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="py-4 text-center text-slate-400">{{ 'ficha.noItems' | transloco }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          @if (editMode()) {
            <div class="border-t border-slate-100 p-3">
              <button type="button" class="btn-ghost text-sm" (click)="addItem(cat.item)"><app-icon name="plus" [size]="14" /> {{ 'ficha.addItem' | transloco }}</button>
            </div>
          }
        }
      </section>
    }
    @if (editMode()) {
      <button type="button" class="btn-secondary" (click)="addCategory()"><app-icon name="plus" [size]="16" /> {{ 'ficha.addCategory' | transloco }}</button>
    }
  `,
})
export class FichaPage {
  readonly id = input.required<string>();
  protected readonly ctx = inject(ContextStore);
  private readonly sb = inject(Supabase);
  private readonly refs = inject(ReferenceService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly dialog = inject(Dialog);
  private readonly t = inject(TranslocoService);
  private readonly lang = toSignal(this.t.langChanges$, { initialValue: this.t.getActiveLang() });
  private channel: RealtimeChannel | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly loading = signal(true);
  protected readonly orgName = signal('');
  protected readonly items = signal<FichaItem[]>([]);
  protected readonly docs = signal<FichaDocument[]>([]);
  protected readonly editMode = signal(false);
  protected readonly editingAnswer = signal<string | null>(null);
  protected readonly collapsed = signal(new Set<string>());
  protected search = '';
  protected stateFilter = '';
  protected onlyValidity = false;
  protected onlyAttachment = false;

  protected readonly canWrite = computed(() => this.ctx.canWrite('user', this.id()) || this.ctx.canWrite('user'));
  protected readonly canManage = computed(() => this.ctx.canWrite('manager', this.id()) || this.ctx.canWrite('manager'));
  protected readonly categories = computed<Category[]>(() => {
    const all = this.items();
    return all.filter((i) => i.is_category && !i.parent_id)
      .map((c) => ({ item: c, children: all.filter((i) => i.parent_id === c.id) }));
  });
  protected readonly itemCount = computed(() => this.items().filter((i) => !i.is_category).length);

  constructor() {
    effect(() => { void this.load(this.id()); });
    inject(DestroyRef).onDestroy(() => { if (this.channel) void this.sb.client.removeChannel(this.channel); });
  }

  // ------------------------------------------------------------ view helpers
  protected visible(): Category[] {
    const q = this.search.trim().toLowerCase();
    return this.categories().map((c) => ({
      item: c.item,
      children: c.children.filter((i) =>
        (!q || this.tr(i).toLowerCase().includes(q) || (i.catalog_code ?? '').toLowerCase().includes(q) || (i.answer ?? '').toLowerCase().includes(q))
        && (!this.stateFilter || i.compliance_state === this.stateFilter)
        && (!this.onlyValidity || i.has_validity)
        && (!this.onlyAttachment || i.requires_attachment)),
    })).filter((c) => c.children.length || (!q && !this.stateFilter && !this.onlyValidity && !this.onlyAttachment));
  }

  protected tr(i: FichaItem): string {
    return this.lang() === 'en' ? (i.translations?.en?.title ?? i.title) : i.title;
  }
  protected trDesc(i: FichaItem): string {
    return this.lang() === 'en' ? (i.translations?.en?.description ?? '') : '';
  }
  protected answerDisplay(i: FichaItem): string {
    return i.bound_field === 'sector' ? this.refs.label('sector', i.answer) : (i.answer ?? '');
  }
  protected docsOf(itemId: string): FichaDocument[] {
    return this.docs().filter((d) => d.item_ids.includes(itemId));
  }
  protected applicableCount(c: Category): number { return c.children.filter((i) => i.is_applicable).length; }
  protected regularCount(c: Category): number { return c.children.filter((i) => i.is_applicable && i.compliance_state === 'regular').length; }
  protected progress(c: Category): number {
    const n = this.applicableCount(c);
    return n ? (this.regularCount(c) / n) * 100 : 100;
  }
  protected canEditItem(i: FichaItem): boolean {
    return this.canManage() || (this.canWrite() && i.assignee_id === this.ctx.profile()?.id);
  }
  protected toggleCat(id: string): void {
    this.collapsed.update((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  protected clearFilters(): void {
    this.search = ''; this.stateFilter = ''; this.onlyValidity = false; this.onlyAttachment = false;
  }

  // ---------------------------------------------------------------- data
  private async load(orgId: string): Promise<void> {
    const [org, items, docs] = await Promise.all([
      this.sb.client.from('organizations').select('name').eq('id', orgId).single(),
      this.sb.client.from('checklist_items_state').select('*').eq('organization_id', orgId).order('sort_order'),
      this.sb.client.from('documents').select('id, original_name, mime_type, size_bytes, created_at, uploaded_by, document_items(checklist_item_id)')
        .eq('organization_id', orgId).is('deleted_at', null).order('created_at', { ascending: false }),
    ]);
    if (org.error || items.error) {
      this.toast.error(errorKey(org.error ?? items.error));
      this.loading.set(false);
      return;
    }
    this.orgName.set(org.data.name);
    this.items.set(items.data as FichaItem[]);
    this.docs.set(((docs.data ?? []) as (Omit<FichaDocument, 'item_ids'> & { document_items: { checklist_item_id: string }[] })[])
      .map((d) => ({ ...d, item_ids: d.document_items.map((x) => x.checklist_item_id) })));
    this.loading.set(false);
    this.subscribe(orgId);
  }

  /** Live sync: any change to this entity's items or documents (by anyone) refreshes the view. */
  private subscribe(orgId: string): void {
    if (this.channel) return;
    const refresh = () => {
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => void this.load(orgId), 400);
    };
    this.channel = this.sb.client.channel(`ficha:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items', filter: `organization_id=eq.${orgId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `organization_id=eq.${orgId}` }, refresh)
      .subscribe();
  }

  /** Optimistic-locked update of one item. */
  protected async patch(it: FichaItem, changes: Partial<FichaItem>): Promise<void> {
    const { data, error } = await this.sb.client.from('checklist_items')
      .update({ ...changes, row_version: it.row_version }).eq('id', it.id).select('row_version').maybeSingle();
    if (error || !data) {
      this.toast.error(error ? errorKey(error) : 'errors.forbidden');
      await this.load(this.id());
      return;
    }
    await this.load(this.id());
  }

  protected async saveAnswer(it: FichaItem, value: string): Promise<void> {
    if (this.editingAnswer() !== it.id) return;
    this.editingAnswer.set(null);
    const v = value.trim() || null;
    if (v === it.answer) return;
    await this.patch(it, { answer: v });
  }

  protected async addItem(cat: FichaItem): Promise<void> {
    const title = prompt(this.t.translate('ficha.newItemPrompt'));
    if (!title?.trim()) return;
    const siblings = this.items().filter((i) => i.parent_id === cat.id);
    const { error } = await this.sb.client.from('checklist_items').insert({
      checklist_id: cat.checklist_id, organization_id: cat.organization_id, parent_id: cat.id, title: title.trim(),
      catalog_group: cat.catalog_group, sort_order: Math.max(0, ...siblings.map((s) => s.sort_order)) + 1,
    });
    if (error) this.toast.error(errorKey(error)); else await this.load(this.id());
  }

  protected async addCategory(): Promise<void> {
    const title = prompt(this.t.translate('ficha.newCategoryPrompt'));
    if (!title?.trim()) return;
    const any = this.items()[0];
    if (!any) return;
    const { error } = await this.sb.client.from('checklist_items').insert({
      checklist_id: any.checklist_id, organization_id: any.organization_id, is_category: true, title: title.trim(),
      catalog_group: title.trim(), sort_order: Math.max(0, ...this.categories().map((c) => c.item.sort_order)) + 1,
    });
    if (error) this.toast.error(errorKey(error)); else await this.load(this.id());
  }

  protected async removeItem(it: FichaItem): Promise<void> {
    const ok = await this.confirm.ask({ title: it.is_category ? 'ficha.removeCategory' : 'ficha.removeItem', danger: true, confirm: 'common.remove' });
    if (!ok) return;
    const { error } = await this.sb.client.from('checklist_items').delete().eq('id', it.id);
    if (error) this.toast.error(errorKey(error)); else await this.load(this.id());
  }

  protected async addDocument(preselect?: string[]): Promise<void> {
    const data: AddDocumentData = {
      orgId: this.id(), preselect, titleOf: (i) => this.tr(i),
      items: this.items().filter((i) => !i.is_category && i.requires_attachment && i.is_applicable),
    };
    const ref = this.dialog.open<boolean>(AddDocumentDialog, { data });
    if (await firstValueFrom(ref.closed)) {
      this.toast.success('ficha.uploaded');
      await this.load(this.id());
    }
  }

  protected async download(d: FichaDocument): Promise<void> {
    try {
      const { url } = await this.sb.fn<{ url: string }>('document-download', { document_id: d.id });
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      this.toast.error(errorKey(e));
    }
  }

  protected async deleteDoc(d: FichaDocument): Promise<void> {
    if (!(await this.confirm.ask({ title: 'ficha.deleteDoc', body: 'ficha.deleteDocBody', danger: true, confirm: 'common.delete',
                                   params: { name: d.original_name } }))) return;
    try {
      await this.sb.rpc('delete_document', { doc: d.id });
      this.toast.success('ficha.docDeleted');
      await this.load(this.id());
    } catch (e) {
      this.toast.error(errorKey(e));
    }
  }
}
