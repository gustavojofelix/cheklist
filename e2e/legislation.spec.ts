import { expect, test } from '@playwright/test';
import { expectAccessible, login } from './helpers';

const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });

test('legislation: staff pair an original with its alterations; customers read the chain', async ({ page, browser }, testInfo) => {
  const title = `E2E Código ${Date.now()}`;
  await login(page, 'superadmin');
  await page.goto('/admin/legislation');
  await page.getByRole('button', { name: 'Novo diploma' }).click();
  await page.getByLabel('Título', { exact: true }).fill(title);
  await page.getByLabel('Número', { exact: true }).fill('1.000');
  await page.getByLabel('Data', { exact: true }).fill('1950-12-12');
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const add = async (role: string, diploma: string, date: string, file: string) => {
    await page.getByRole('button', { name: 'Adicionar documento' }).click();
    const dlg = page.getByRole('dialog', { name: 'Adicionar documento' });
    await dlg.getByLabel(role, { exact: true }).check();
    await dlg.getByLabel('Diploma', { exact: true }).fill(diploma);
    await dlg.getByLabel('Data de publicação', { exact: true }).fill(date);
    await dlg.locator('input[type=file]').setInputFiles(pdf(file));
    await dlg.getByRole('button', { name: 'Carregar' }).click();
    return dlg;
  };
  await add('Original', 'Decreto n.º 1.000', '1950-12-12', 'original.pdf');
  await expect(page.getByText('Documento adicionado.')).toBeVisible();
  // added newest first; the page orders alterations by date
  await add('Alteração', 'Decreto-Lei n.º 1/2013', '2013-07-04', 'alt-2013.pdf');
  await add('Alteração', 'Decreto n.º 38.295', '1951-08-04', 'alt-1951.pdf');
  const early = await add('Alteração', 'Decreto antigo', '1940-01-01', 'alt-1940.pdf');
  await expect(early).toContainText('não pode ter data anterior');
  await early.getByRole('button', { name: 'Cancelar' }).click();

  const chain = page.getByRole('list', { name: 'Cadeia do diploma' });
  await expect(chain.getByRole('listitem').nth(1)).toContainText('Alteração 1');
  await expect(chain.getByRole('listitem').nth(1)).toContainText('Decreto n.º 38.295');
  await expect(chain.getByRole('listitem').nth(2)).toContainText('Decreto-Lei n.º 1/2013');
  await expect(chain).toContainText('altera o Decreto n.º 1.000');
  await expectAccessible(page, 'legislation detail (back office)');
  const url = page.url().replace('/admin/legislation/', '/legislation/');

  // a customer sees the same chain, read-only
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, locale: 'pt-PT' });
  const customer = await ctx.newPage();
  await login(customer, 'admin');
  await customer.goto(new URL(url).pathname);
  await expect(customer.getByRole('heading', { name: title })).toBeVisible();
  await expect(customer.getByRole('list', { name: 'Cadeia do diploma' })).toContainText('Alteração 2');
  await expect(customer.getByRole('button', { name: 'Adicionar documento' })).toHaveCount(0);
  await expectAccessible(customer, 'legislation detail (front office)');
  await ctx.close();

  // clean up: remove the act (documents and files go with it)
  await page.getByRole('button', { name: 'Remover diploma' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remover' }).click();
  await expect(page).toHaveURL(/\/admin\/legislation$/);
  await expect(page.getByText(title)).toHaveCount(0);
});
