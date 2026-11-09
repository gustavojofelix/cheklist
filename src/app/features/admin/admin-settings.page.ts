import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';

type Tab = 'general' | 'security' | 'lists' | 'emails';
interface Ref { list_key: string; value: string; label: { pt: string; en?: string }; parent_value: string | null; sort_order: number; is_active: boolean }
interface Tpl { key: string; locale: string; subject: string; body_md: string }

const NUMERIC = ['trial_days', 'grace_days', 'recycle_days', 'max_file_size_bytes', 'otp_unlock_minutes', 'critical_repeat_days'];
const BOOLEAN = ['document_otp_default', 'ai_enabled_global', 'quota_warnings_enabled'];
const LISTS = ['entity_type', 'entity_subtype', 'company_size', 'province', 'sector'];

/** Back office: platform settings, reference lists and e-mail templates. */
@Component({
  selector: 'app-admin-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, PageHeader, Icon],
  template: `
    <app-page-header [title]="'admin.nav.settings' | transloco" />
    <div class="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      @for (t of tabs; track t) {
        <button type="button" role="tab" (click)="tab.set(t)" [attr.aria-selected]="tab() === t"
                class="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium" [class]="tab() === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'">
          {{ 'admin.settings.tabs.' + t | transloco }}</button>
      }
    </div>

    @switch (tab()) {
      @case ('general') {
        <div class="card max-w-xl space-y-3 p-5">
          @for (k of numeric; track k) {
            <label class="flex items-center justify-between gap-3 text-sm">{{ 'admin.settings.' + k | transloco }}
              <input type="number" min="0" class="input !w-40" [ngModel]="settings()[k]" (change)="saveSetting(k, +$any($event.target).value)" /></label>
          }
          <label class="block text-sm">{{ 'admin.settings.app_url' | transloco }}
            <input class="input mt-1" [ngModel]="settings()['app_url']" (change)="saveSetting('app_url', $any($event.target).value.trim())" /></label>
        </div>
      }
      @case ('security') {
        <div class="card max-w-xl space-y-3 p-5">
          @for (k of booleans; track k) {
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" [ngModel]="settings()[k]" (ngModelChange)="saveSetting(k, $event)" /> {{ 'admin.settings.' + k | transloco }}</label>
          }
          <p class="text-xs text-slate-500">{{ 'admin.settings.fixedRules' | transloco }}</p>
        </div>
      }
      @case ('lists') {
        <div class="card p-5">
          <select class="input mb-4 !w-64" [ngModel]="listKey()" (ngModelChange)="listKey.set($event)" [attr.aria-label]="'admin.settings.list' | transloco">
            @for (l of lists; track l) { <option [value]="l">{{ 'admin.settings.lists.' + l | transloco }}</option> }
          </select>
          <table class="table-base">
            <thead><tr><th>{{ 'admin.settings.value' | transloco }}</th><th>PT</th><th>EN</th>@if (listKey() === 'entity_subtype') {<th>{{ 'org.type' | transloco }}</th>}<th>{{ 'admin.plans.active' | transloco }}</th></tr></thead>
            <tbody>
              @for (r of listRows(); track r.value) {
                <tr>
                  <td class="font-mono text-xs">{{ r.value }}</td>
                  <td><input class="input !py-1" [ngModel]="r.label.pt" (change)="saveRef(r, { label: { ...r.label, pt: $any($event.target).value } })" aria-label="PT" /></td>
                  <td><input class="input !py-1" [ngModel]="r.label.en" (change)="saveRef(r, { label: { ...r.label, en: $any($event.target).value } })" aria-label="EN" /></td>
                  @if (listKey() === 'entity_subtype') { <td class="text-slate-500">{{ r.parent_value }}</td> }
                  <td><input type="checkbox" [checked]="r.is_active" (change)="saveRef(r, { is_active: $any($event.target).checked })" [attr.aria-label]="'admin.plans.active' | transloco" /></td>
                </tr>
              }
            </tbody>
          </table>
          <form class="mt-3 flex flex-wrap gap-2" (ngSubmit)="addRef()">
            <input class="input !w-32 font-mono" name="v" [(ngModel)]="newValue" [placeholder]="'admin.settings.value' | transloco" />
            <input class="input !w-64" name="pt" [(ngModel)]="newPt" placeholder="PT" />
            <input class="input !w-64" name="en" [(ngModel)]="newEn" placeholder="EN" />
            @if (listKey() === 'entity_subtype') {
              <select class="input !w-48" name="parent" [(ngModel)]="newParent">
                @for (r of parentOptions(); track r.value) { <option [value]="r.value">{{ r.label.pt }}</option> }</select>
            }
            <button class="btn-secondary" type="submit" [disabled]="!newValue.trim() || !newPt.trim()"><app-icon name="plus" [size]="14" /> {{ 'common.create' | transloco }}</button>
          </form>
        </div>
      }
      @case ('emails') {
        <div class="space-y-4">
          @for (t of templates(); track t.key + t.locale) {
            <div class="card space-y-2 p-4">
              <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">{{ t.key }} · {{ t.locale }}</p>
              <input class="input" [(ngModel)]="t.subject" [attr.aria-label]="'admin.emails.subject' | transloco" />
              <textarea class="input font-mono text-xs" rows="7" [(ngModel)]="t.body_md" aria-label="Body"></textarea>
              <div class="flex items-center justify-between"><span class="text-xs text-slate-400">{{ 'admin.settings.placeholders' | transloco }}</span>
                <button type="button" class="btn-primary !py-1" (click)="saveTemplate(t)">{{ 'common.save' | transloco }}</button></div>
            </div>
          }
        </div>
      }
    }
  `,
})
export class AdminSettingsPage implements OnInit {
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  protected readonly tabs: Tab[] = ['general', 'security', 'lists', 'emails'];
  protected readonly tab = signal<Tab>('general');
  protected readonly numeric = NUMERIC;
  protected readonly booleans = BOOLEAN;
  protected readonly lists = LISTS;
  protected readonly settings = signal<Record<string, unknown>>({});
  protected readonly refs = signal<Ref[]>([]);
  protected readonly templates = signal<Tpl[]>([]);
  protected readonly listKey = signal('entity_subtype');
  protected readonly listRows = computed(() => this.refs().filter((r) => r.list_key === this.listKey()));
  protected readonly parentOptions = computed(() => this.refs().filter((r) => r.list_key === 'entity_type'));
  protected newValue = '';
  protected newPt = '';
  protected newEn = '';
  protected newParent = 'commercial';

  async ngOnInit(): Promise<void> {
    const [s, r, t] = await Promise.all([
      this.sb.client.from('platform_settings').select('key, value'),
      this.sb.client.from('reference_lists').select('*').order('sort_order'),
      this.sb.client.from('email_templates').select('key, locale, subject, body_md').order('key').order('locale'),
    ]);
    this.settings.set(Object.fromEntries(((s.data ?? []) as { key: string; value: unknown }[]).map((x) => [x.key, x.value])));
    this.refs.set((r.data ?? []) as Ref[]);
    this.templates.set((t.data ?? []) as Tpl[]);
  }

  protected async saveSetting(key: string, value: unknown): Promise<void> {
    const { error } = await this.sb.client.from('platform_settings').upsert({ key, value });
    if (error) this.toast.error(errorKey(error)); else { this.toast.success('common.saved'); await this.ngOnInit(); }
  }

  protected async saveRef(r: Ref, changes: Partial<Ref>): Promise<void> {
    const { error } = await this.sb.client.from('reference_lists').update(changes).eq('list_key', r.list_key).eq('value', r.value);
    if (error) this.toast.error(errorKey(error)); else await this.ngOnInit();
  }

  protected async addRef(): Promise<void> {
    const key = this.listKey();
    const { error } = await this.sb.client.from('reference_lists').insert({
      list_key: key, value: this.newValue.trim(), label: { pt: this.newPt.trim(), en: this.newEn.trim() || this.newPt.trim() },
      parent_value: key === 'entity_subtype' ? this.newParent : null,
      sort_order: Math.max(0, ...this.listRows().map((x) => x.sort_order)) + 1,
    });
    if (error) { this.toast.error(errorKey(error)); return; }
    this.newValue = this.newPt = this.newEn = '';
    await this.ngOnInit();
  }

  protected async saveTemplate(t: Tpl): Promise<void> {
    const { error } = await this.sb.client.from('email_templates').update({ subject: t.subject, body_md: t.body_md })
      .eq('key', t.key).eq('locale', t.locale);
    if (error) this.toast.error(errorKey(error)); else this.toast.success('common.saved');
  }
}
