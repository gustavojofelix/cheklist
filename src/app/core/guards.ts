import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ContextStore, OrgRole } from './context.store';

async function ensureContext(): Promise<{ auth: AuthService; ctx: ContextStore }> {
  const auth = inject(AuthService);
  const ctx = inject(ContextStore);
  await auth.whenReady();
  if (auth.session() && !ctx.loaded()) await ctx.load();
  return { auth, ctx };
}

/** Signed in and member of at least one organization (otherwise → onboarding). */
export const authGuard: CanActivateFn = async (_r, state) => {
  const router = inject(Router);
  const { auth, ctx } = await ensureContext();
  if (!auth.session()) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (ctx.profile()?.status === 'suspended') {
    await auth.signOut();
    return router.createUrlTree(['/login'], { queryParams: { suspended: 1 } });
  }
  if (ctx.organizations().length === 0) {
    return router.createUrlTree([ctx.isPlatform() ? '/admin' : '/onboarding']);
  }
  return true;
};

/** Signed in; no organization required (onboarding, invitation acceptance). */
export const sessionGuard: CanActivateFn = async (_r, state) => {
  const router = inject(Router);
  const { auth } = await ensureContext();
  return auth.session() ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(AuthService);
  await auth.whenReady();
  return auth.session() && !auth.recovering() ? router.createUrlTree(['/dashboard']) : true;
};

export function roleGuard(min: OrgRole): CanActivateFn {
  return async () => {
    const router = inject(Router);
    const { ctx } = await ensureContext();
    return ctx.can(min) ? true : router.createUrlTree(['/dashboard']);
  };
}

export const platformGuard: CanActivateFn = async (_r, state) => {
  const router = inject(Router);
  const { auth, ctx } = await ensureContext();
  if (!auth.session()) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  return ctx.isPlatform() ? true : router.createUrlTree(['/dashboard']);
};
