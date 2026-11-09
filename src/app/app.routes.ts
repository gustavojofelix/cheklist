import { Routes } from '@angular/router';
import { authGuard, guestGuard, platformGuard, roleGuard, sessionGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

  // ---------------------------------------------------------------- public / auth
  {
    path: '',
    loadComponent: () => import('./layouts/auth-shell').then((m) => m.AuthShell),
    children: [
      { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage) },
      { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage) },
      { path: 'forgot-password', canActivate: [guestGuard], loadComponent: () => import('./features/auth/forgot-password.page').then((m) => m.ForgotPasswordPage) },
      { path: 'reset-password', loadComponent: () => import('./features/auth/reset-password.page').then((m) => m.ResetPasswordPage) },
      { path: 'invite/:token', loadComponent: () => import('./features/auth/invite.page').then((m) => m.InvitePage) },
      { path: 'onboarding', canActivate: [sessionGuard], loadComponent: () => import('./features/auth/onboarding.page').then((m) => m.OnboardingPage) },
      { path: 'terms', loadComponent: () => import('./features/auth/legal.page').then((m) => m.LegalPage), data: { doc: 'terms' } },
      { path: 'privacy', loadComponent: () => import('./features/auth/legal.page').then((m) => m.LegalPage), data: { doc: 'privacy' } },
    ],
  },

  // ---------------------------------------------------------------- front office
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layouts/app-shell').then((m) => m.AppShell),
    children: [
      { path: 'dashboard', title: 'nav.dashboard', loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'company', title: 'nav.company', loadComponent: () => import('./features/company/company.page').then((m) => m.CompanyPage) },
      { path: 'entities', title: 'nav.entities', loadComponent: () => import('./features/entities/entities.page').then((m) => m.EntitiesPage) },
      { path: 'entities/:id/version', title: 'nav.entities', loadComponent: () => import('./features/ficha/version-review.page').then((m) => m.VersionReviewPage) },
      { path: 'entities/:id/ficha', title: 'nav.entities', loadComponent: () => import('./features/ficha/ficha.page').then((m) => m.FichaPage) },
      { path: 'recycle-bin', title: 'nav.recycle', loadComponent: () => import('./features/recycle-bin/recycle-bin.page').then((m) => m.RecycleBinPage) },
      { path: 'audit', title: 'nav.audit', canActivate: [roleGuard('manager')], loadComponent: () => import('./features/audit/audit.page').then((m) => m.AuditPage) },
      { path: 'profile', title: 'nav.profile', loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage) },
      { path: 'billing', title: 'nav.billing', canActivate: [roleGuard('admin')], loadComponent: () => import('./features/billing/billing.page').then((m) => m.BillingPage) },
      { path: 'reports', title: 'nav.reports', loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage) },
      { path: 'reports/:checklistId', title: 'nav.reports', loadComponent: () => import('./features/reports/select-points.page').then((m) => m.SelectPointsPage) },
      { path: 'legislation', title: 'nav.legislation', loadComponent: () => import('./features/legislation/legislation-list.page').then((m) => m.LegislationListPage) },
      { path: 'legislation/:id', title: 'nav.legislation', loadComponent: () => import('./features/legislation/legislation-detail.page').then((m) => m.LegislationDetailPage) },
      { path: 'ai', title: 'nav.ai', loadComponent: () => import('./features/ai/ai.page').then((m) => m.AiPage) },
    ],
  },

  // ---------------------------------------------------------------- back office
  {
    path: 'admin',
    canActivate: [platformGuard],
    loadComponent: () => import('./layouts/app-shell').then((m) => m.AppShell),
    data: { admin: true },
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },

  { path: '**', redirectTo: 'dashboard' },
];
