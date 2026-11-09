import { expect, test } from '@playwright/test';
import { expectAccessible, login } from './helpers';

test.describe('auth & navigation', () => {
  test('login page is accessible and rejects wrong passwords', async ({ page }) => {
    await page.goto('/login');
    await expectAccessible(page, 'login');
    await page.getByLabel('Endereço de e-mail').fill('demo@checklist.test');
    await page.getByLabel('Palavra-passe').fill('wrong-password');
    await page.getByRole('button', { name: 'Iniciar sessão' }).click();
    await expect(page.getByRole('alert')).toContainText('incorrectos');
  });

  test('admin signs in, sees the dashboard, switches language, signs out', async ({ page }) => {
    await login(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
    await expect(page.getByText('Total de itens')).toBeVisible();
    await expectAccessible(page, 'dashboard');

    await page.getByRole('button', { name: /Idioma/ }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.getByRole('button', { name: /Language/ }).click();
    await page.getByRole('menuitem', { name: 'Português' }).click();
    await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();

    await page.getByRole('button', { name: /Ana Demo/ }).click();
    await page.getByRole('menuitem', { name: 'Terminar sessão' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('customers cannot open the back office', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/organizations');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('a manager does not see billing and is sent away from it', async ({ page }) => {
    await login(page, 'manager');
    await expect(page.getByRole('link', { name: 'Subscrições' })).toHaveCount(0);
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('entity checklist', () => {
  test('edit a description, persist it, attach and delete a document', async ({ page }) => {
    await login(page, 'admin');
    await page.getByRole('link', { name: 'Entidades' }).click();
    await page.getByRole('link', { name: 'Abrir ficha da entidade' }).first().click();
    await expect(page.getByRole('heading', { name: /Ficha da Entidade/ })).toBeVisible();
    await expectAccessible(page, 'ficha');

    // inline edit (LEG-04 · Data da Constituição)
    const value = `E2E ${Date.now()}`;
    const row = page.getByRole('row').filter({ hasText: 'LEG-04' });
    await row.getByRole('cell').nth(2).getByRole('button').click();
    await row.getByRole('textbox').fill(value);
    await row.getByRole('textbox').press('Enter');
    await expect(page.getByRole('row').filter({ hasText: 'LEG-04' })).toContainText(value);   // saved and re-loaded
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: 'LEG-04' })).toContainText(value);

    // attach a small PDF to LEG-01, then move it to the recycle bin
    const leg01 = page.getByRole('row').filter({ hasText: 'LEG-01' });
    await leg01.getByRole('button', { name: 'Anexar' }).click();
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    await page.locator('input[type=file]').setInputFiles({ name: 'e2e-test.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.getByRole('button', { name: 'Carregar' }).click();
    await expect(page.getByText('Documento carregado.')).toBeVisible();
    await expect(leg01.getByText('e2e-test.pdf')).toBeVisible();
    await leg01.getByRole('button', { name: 'Eliminar' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Documento movido para os Documentos Apagados.')).toBeVisible();

    await page.getByRole('link', { name: 'Documentos Apagados' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'e2e-test.pdf' }).first()).toBeVisible();
  });
});

test.describe('screens are accessible', () => {
  for (const path of ['/company', '/entities', '/reports', '/audit', '/billing', '/ai', '/profile', '/recycle-bin']) {
    test(`a11y ${path}`, async ({ page }) => {
      await login(page, 'admin');
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectAccessible(page, path);
    });
  }

  test('back office is accessible', async ({ page }) => {
    await login(page, 'superadmin');
    for (const path of ['/admin/organizations', '/admin/templates', '/admin/plans', '/admin/payments', '/admin/settings']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectAccessible(page, path);
    }
  });
});

test('mobile: navigation drawer and checklist are usable @mobile', async ({ page }) => {
  await login(page, 'admin');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('link', { name: 'Entidades' }).click();
  await page.getByRole('link', { name: 'Abrir ficha da entidade' }).first().click();
  await expect(page.getByRole('heading', { name: /Ficha da Entidade/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(1);

  // items are cards on phones (the table is hidden) and can be edited in place
  await expect(page.getByRole('table').first()).toBeHidden();
  const card = page.getByRole('listitem').filter({ hasText: 'LEG-05' });
  const value = `M ${Date.now()}`;
  await card.getByRole('button').first().click();
  await card.getByRole('textbox').fill(value);
  await card.getByRole('textbox').press('Enter');
  await expect(page.getByRole('listitem').filter({ hasText: 'LEG-05' })).toContainText(value);
  await expect(page.getByRole('button', { name: 'Adicionar documento' })).toBeVisible();   // floating button
  await expectAccessible(page, 'ficha (mobile)');
});
