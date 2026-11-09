// Resets demo data touched by the e2e tests (DEV project only), through the API as the demo admin.
//   node scripts/presentation/tidy-demo.mjs .
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync(process.argv[2] + '/src/environments/environment.ts', 'utf8');
const url = env.match(/supabaseUrl:\s*'([^']+)'/)[1], key = env.match(/supabaseKey:\s*\n?\s*'([^']+)'/)[1];
const sb = createClient(url, key, { auth: { persistSession: false } });
const { error: e0 } = await sb.auth.signInWithPassword({ email: 'demo@checklist.test', password: 'Checklist#Demo2026' });
if (e0) throw e0;
const { data: items } = await sb.from('checklist_items').select('id, catalog_code, answer, row_version').in('catalog_code', ['LEG-04', 'LEG-05']);
const want = { 'LEG-04': '12/03/2019', 'LEG-05': '500 000,00 MZN' };
for (const i of items) {
  if (i.answer === want[i.catalog_code]) continue;
  const { error } = await sb.from('checklist_items').update({ answer: want[i.catalog_code], row_version: i.row_version }).eq('id', i.id);
  console.log(i.catalog_code, error ? error.message : 'updated');
}
const { data: docs, error: e1 } = await sb.from('documents').update({ original_name: 'Certidao_Registo_Comercial_2025.pdf' }).eq('original_name', 'e2e-test.pdf').select('id');
console.log('documents renamed:', e1 ? e1.message : docs.length);
