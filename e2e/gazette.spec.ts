import { expect, test } from '@playwright/test';
import { expectAccessible, login } from './helpers';

const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });

test('Boletim da República: an original publication and its alterations form one chain', async ({ page }) => {
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Entidades' }).click();
  await page.getByRole('link', { name: 'Abrir ficha da entidade' }).first().click();
  const chain = page.getByRole('region', { name: 'Pacto social no Boletim da República' }).first();
  await expect(chain).toBeVisible();
  await expect(chain).toContainText('Ainda não há publicações');

  // the original (incorporation), with its document
  await chain.getByRole('button', { name: 'Registar publicação original' }).click();
  const dlg = page.getByRole('dialog', { name: /Registar/ });
  await dlg.getByLabel('Data de publicação').fill('2019-03-12');
  await dlg.getByLabel('Série e número do BR').fill('III Série, n.º 50');
  await dlg.getByLabel('Resumo').fill('Constituição E2E');
  await dlg.locator('input[type=file]').setInputFiles(pdf('e2e-constituicao.pdf'));
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(chain).toContainText('Original');
  await expect(chain).toContainText('e2e-constituicao.pdf');

  // an alteration dated before the original is refused
  await chain.getByRole('button', { name: 'Registar alteração' }).click();
  await dlg.getByLabel('Tipo de publicação').selectOption('alteracao_capital');
  await dlg.getByLabel('Data de publicação').fill('2018-01-01');
  await expect(dlg).toContainText('não pode ter data anterior');
  await dlg.getByLabel('Data de publicação').fill('2023-02-09');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(chain).toContainText('Alteração 1');
  await expect(chain).toContainText('Alteração do capital social');
  await expect(chain).toContainText(/altera SOC-16\.\d\d/);
  await expect(chain).toContainText('Original + 1 alteração(ões) ligadas');
  await expectAccessible(page, 'ficha with gazette chain');

  // clean up: remove both entries in edit mode
  await page.getByRole('button', { name: 'Editar checklist' }).click();
  for (let i = 0; i < 2; i++) {
    await chain.getByRole('button', { name: 'Remover' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remover' }).click();
    await expect(chain.getByRole('listitem')).toHaveCount(1 - i);
  }
  await expect(chain).toContainText('Ainda não há publicações');
});
