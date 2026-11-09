import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', title: 'admin.nav.dashboard', loadComponent: () => import('./admin-organizations.page').then((m) => m.AdminOrganizationsPage) },
  { path: 'organizations', title: 'admin.nav.organizations', loadComponent: () => import('./admin-organizations.page').then((m) => m.AdminOrganizationsPage) },
  { path: 'emails', title: 'admin.nav.emails', loadComponent: () => import('./admin-outbox.page').then((m) => m.AdminOutboxPage) },
  { path: 'templates', title: 'admin.nav.templates', loadComponent: () => import('./admin-templates.page').then((m) => m.AdminTemplatesPage) },
  { path: 'templates/:id', title: 'admin.nav.templates', loadComponent: () => import('./admin-template-editor.page').then((m) => m.AdminTemplateEditorPage) },
  { path: 'legislation', title: 'nav.legislation', data: { admin: true }, loadComponent: () => import('../legislation/legislation-list.page').then((m) => m.LegislationListPage) },
  { path: 'legislation/:id', title: 'nav.legislation', data: { admin: true }, loadComponent: () => import('../legislation/legislation-detail.page').then((m) => m.LegislationDetailPage) },
  { path: 'plans', title: 'admin.nav.plans', loadComponent: () => import('./admin-plans.page').then((m) => m.AdminPlansPage) },
  { path: 'vouchers', title: 'admin.nav.vouchers', loadComponent: () => import('./admin-vouchers.page').then((m) => m.AdminVouchersPage) },
  { path: 'staff', title: 'admin.nav.staff', loadComponent: () => import('./admin-staff.page').then((m) => m.AdminStaffPage) },
  { path: 'settings', title: 'admin.nav.settings', loadComponent: () => import('./admin-settings.page').then((m) => m.AdminSettingsPage) },
  { path: 'payments', title: 'admin.nav.payments', loadComponent: () => import('./admin-payments.page').then((m) => m.AdminPaymentsPage) },
  { path: 'audit', title: 'admin.nav.audit', loadComponent: () => import('./admin-audit.page').then((m) => m.AdminAuditPage) },
];
