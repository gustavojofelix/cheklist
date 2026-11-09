import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', title: 'admin.nav.dashboard', loadComponent: () => import('./admin-organizations.page').then((m) => m.AdminOrganizationsPage) },
  { path: 'organizations', title: 'admin.nav.organizations', loadComponent: () => import('./admin-organizations.page').then((m) => m.AdminOrganizationsPage) },
  { path: 'templates', title: 'admin.nav.templates', loadComponent: () => import('../placeholder/placeholder.page').then((m) => m.PlaceholderPage), data: { feature: 'templates', iteration: 5 } },
  { path: 'plans', title: 'admin.nav.plans', loadComponent: () => import('../placeholder/placeholder.page').then((m) => m.PlaceholderPage), data: { feature: 'plans', iteration: 5 } },
  { path: 'emails', title: 'admin.nav.emails', loadComponent: () => import('./admin-outbox.page').then((m) => m.AdminOutboxPage) },
  { path: 'audit', title: 'admin.nav.audit', loadComponent: () => import('../placeholder/placeholder.page').then((m) => m.PlaceholderPage), data: { feature: 'adminAudit', iteration: 5 } },
];
