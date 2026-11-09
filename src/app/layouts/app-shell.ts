import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../core/auth.service';
import { ContextStore } from '../core/context.store';
import { Supabase } from '../core/supabase';
import { Icon } from '../shared/ui/icon';
import { LocaleSwitcher } from '../shared/ui/locale-switcher';

interface NavItem { path: string; icon: string; key: string; min?: 'manager' | 'admin' }

const FRONT: NavItem[] = [
  { path: '/dashboard', icon: 'dashboard', key: 'nav.dashboard' },
  { path: '/company', icon: 'building', key: 'nav.company' },
  { path: '/entities', icon: 'layers', key: 'nav.entities' },
  { path: '/ai', icon: 'sparkles', key: 'nav.ai' },
  { path: '/recycle-bin', icon: 'trash', key: 'nav.recycle' },
  { path: '/reports', icon: 'report', key: 'nav.reports' },
  { path: '/audit', icon: 'log', key: 'nav.audit', min: 'manager' },
  { path: '/profile', icon: 'settings', key: 'nav.profile' },
  { path: '/billing', icon: 'card', key: 'nav.billing', min: 'admin' },
];
const ADMIN: NavItem[] = [
  { path: '/admin', icon: 'dashboard', key: 'admin.nav.dashboard' },
  { path: '/admin/organizations', icon: 'building', key: 'admin.nav.organizations' },
  { path: '/admin/templates', icon: 'layers', key: 'admin.nav.templates' },
  { path: '/admin/plans', icon: 'card', key: 'admin.nav.plans' },
  { path: '/admin/vouchers', icon: 'report', key: 'admin.nav.vouchers' },
  { path: '/admin/payments', icon: 'card', key: 'admin.nav.payments' },
  { path: '/admin/staff', icon: 'users', key: 'admin.nav.staff' },
  { path: '/admin/settings', icon: 'settings', key: 'admin.nav.settings' },
  { path: '/admin/emails', icon: 'mail', key: 'admin.nav.emails' },
  { path: '/admin/audit', icon: 'shield', key: 'admin.nav.audit' },
];

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, Icon, LocaleSwitcher, CdkMenuTrigger, CdkMenu, CdkMenuItem],
  template: `
    <div class="flex min-h-screen">
      <!-- sidebar -->
      @if (navOpen()) {
        <div class="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" (click)="navOpen.set(false)"></div>
      }
      <aside class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0"
             [class.-translate-x-full]="!navOpen()">
        <div class="flex h-14 items-center gap-2 border-b border-slate-100 px-4 font-semibold text-slate-900">
          <span class="grid size-7 place-items-center rounded-lg bg-brand-600 text-white"><app-icon name="check" [size]="16" /></span>
          Checklist Legal
        </div>
        <nav class="flex-1 overflow-y-auto p-3" [attr.aria-label]="'nav.main' | transloco">
          <p class="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {{ (isAdmin ? 'nav.backOffice' : 'nav.frontOffice') | transloco }}
          </p>
          @for (item of nav(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="!bg-brand-50 !text-brand-700"
               [routerLinkActiveOptions]="{ exact: item.path === '/admin' }" (click)="navOpen.set(false)"
               class="mb-0.5 flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100">
              <app-icon [name]="item.icon" /> {{ item.key | transloco }}
            </a>
          }
          @if (ctx.isPlatform()) {
            <div class="mt-4 border-t border-slate-100 pt-3">
              <a [routerLink]="isAdmin ? '/dashboard' : '/admin'"
                 class="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100">
                <app-icon name="shield" /> {{ (isAdmin ? 'nav.frontOffice' : 'nav.backOffice') | transloco }}
              </a>
            </div>
          }
        </nav>
        <!-- account switcher -->
        @if (!isAdmin && ctx.accounts().length) {
          <div class="border-t border-slate-100 p-3">
            <p class="px-1 text-[11px] uppercase tracking-wider text-slate-400">{{ 'nav.activeOrg' | transloco }}</p>
            @if (ctx.accounts().length > 1) {
              <select class="input mt-1 !py-1.5" [value]="ctx.active()?.id" (change)="switchOrg($any($event.target).value)"
                      [attr.aria-label]="'nav.activeOrg' | transloco">
                @for (a of ctx.accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
              </select>
            } @else {
              <p class="mt-1 truncate px-1 text-sm font-medium text-slate-700">{{ ctx.active()?.name }}</p>
            }
          </div>
        }
        <div class="border-t border-slate-100 p-3">
          <button type="button" [cdkMenuTriggerFor]="userMenu"
                  class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-slate-100">
            <span class="grid size-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">{{ initials() }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ ctx.profile()?.full_name }}</span>
              <span class="block truncate text-xs text-slate-500">{{ ctx.profile()?.email }}</span>
            </span>
          </button>
          <ng-template #userMenu>
            <div cdkMenu class="min-w-48 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg">
              <a cdkMenuItem routerLink="/profile" class="flex items-center gap-2 rounded px-3 py-1.5 hover:bg-slate-100">
                <app-icon name="user" [size]="16" /> {{ 'nav.profile' | transloco }}</a>
              <button cdkMenuItem type="button" (cdkMenuItemTriggered)="logout()"
                      class="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left hover:bg-slate-100">
                <app-icon name="logout" [size]="16" /> {{ 'auth.logout' | transloco }}</button>
            </div>
          </ng-template>
        </div>
      </aside>

      <!-- main -->
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <button type="button" class="btn-ghost !p-1.5 lg:hidden" (click)="navOpen.set(true)" [attr.aria-label]="'nav.open' | transloco">
            <app-icon name="menu" />
          </button>
          <div class="flex-1 truncate text-sm text-slate-500">{{ ctx.active()?.name }}</div>
          @if (!isAdmin && ctx.readOnly()) {
            <span class="chip bg-amber-100 text-amber-800">{{ 'billing.readOnlyBadge' | transloco }}</span>
          }
          <app-locale-switcher />
        </header>
        @if (ctx.operatorSession(); as op) {
          <div class="flex flex-wrap items-center gap-2 border-b border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900" role="status">
            <app-icon name="shield" [size]="16" />
            <span class="flex-1">{{ 'operator.banner' | transloco: { reason: op.reason } }}</span>
            <button type="button" class="btn-secondary !py-1" (click)="endOperator()">{{ 'operator.end' | transloco }}</button>
          </div>
        }
        @if (!isAdmin && ctx.readOnly()) {
          <div class="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {{ 'billing.readOnlyBanner' | transloco }}
            @if (ctx.can('admin')) { <a routerLink="/billing" class="font-medium underline">{{ 'billing.choosePlan' | transloco }}</a> }
          </div>
        }
        <main class="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AppShell {
  protected readonly ctx = inject(ContextStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sb = inject(Supabase);
  protected readonly isAdmin = !!inject(ActivatedRoute).snapshot.data['admin'];
  protected readonly navOpen = signal(false);

  protected readonly nav = computed(() =>
    this.isAdmin ? ADMIN : FRONT.filter((i) => !i.min || this.ctx.can(i.min)));
  protected readonly initials = computed(() =>
    (this.ctx.profile()?.full_name ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase());

  protected switchOrg(id: string): void {
    this.ctx.setActive(id);
    void this.router.navigateByUrl('/dashboard');
  }

  protected async endOperator(): Promise<void> {
    await this.sb.rpc('operator_access_end');
    await this.ctx.load();
    await this.router.navigateByUrl('/admin/organizations');
  }

  protected async logout(): Promise<void> {
    if (this.ctx.operatorSession()) await this.sb.rpc('operator_access_end').catch(() => undefined);
    await this.auth.signOut();
    this.ctx.reset();
    await this.router.navigateByUrl('/login');
  }
}
