// LACI047 example for the "acasalamento" video and deck (DEV project only, as the seeded superadmin).
//   node scripts/presentation/legislation-demo.mjs load    creates the act and uploads the original, 3 alterations and the revised text
//   node scripts/presentation/legislation-demo.mjs reset   deletes the LACI047 act and its files
// The PDFs are read from LACI_DIR (default: the user's Downloads folder).
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = process.env.LACI_DIR ?? join(homedir(), 'Downloads');
export const ACT = {
  reference: 'LACI047', title: 'Código das Execuções Fiscais', kind: 'decreto', number: '38.088', act_date: '1950-12-12', area: 'Fiscal',
  summary: 'Aprova o Código das Execuções Fiscais, que regula a cobrança coerciva das dívidas ao Estado.',
};
// in the order they are uploaded (the files' own numbering); the platform orders alterations by date
export const DOCS = [
  { file: 'LACI047 - BR ORIGINAL.pdf', name: 'Decreto_38088_original.pdf', role: 'original',
    diploma: 'Decreto n.º 38.088, de 12 de Dezembro de 1950', publication: 'Ministério das Colónias', published_on: '1950-12-12',
    effect: 'Aprova o Código das Execuções Fiscais (texto original).' },
  { file: 'LACI047 - ALTERACAO 1.pdf', name: 'Decreto-Lei_1-2013.pdf', role: 'alteracao',
    diploma: 'Decreto-Lei n.º 1/2013, de 4 de Julho', publication: 'Boletim da República, I Série, n.º 53 (suplemento)', published_on: '2013-07-04',
    effect: 'Aprova o Regime Jurídico da Insolvência e revoga os artigos 147.º e 148.º do Código das Execuções Fiscais.' },
  { file: 'LACI047 - ALTERACAO 2.pdf', name: 'Decreto_46849.pdf', role: 'alteracao',
    diploma: 'Decreto n.º 46.849, de 29 de Janeiro de 1966', publication: 'Ministério do Ultramar', published_on: '1966-01-29',
    effect: 'Revoga o § 1.º do artigo 269.º do Código das Execuções Fiscais.' },
  { file: 'LACI047 - ALTERACAO 3.pdf', name: 'Decreto_38295.pdf', role: 'alteracao',
    diploma: 'Decreto n.º 38.295, de 12 de Junho de 1951', publication: 'Boletim Oficial de Moçambique, I Série, n.º 31', published_on: '1951-08-04',
    effect: 'Substitui o artigo 1.º do Código das Execuções Fiscais.' },
  { file: 'LACI047 - Decreto nº 38088 - Revisto - Download - YF (1).pdf', name: 'Decreto_38088_revisto.pdf', role: 'revisto',
    diploma: 'Decreto n.º 38.088 — texto revisto (consolidado)', publication: 'Mobilelegis', published_on: null,
    effect: 'Texto do Código com as três alterações incorporadas.' },
];
export const filePath = (d) => join(DIR, d.file);

async function client() {
  const env = readFileSync('src/environments/environment.ts', 'utf8');
  const url = env.match(/supabaseUrl:\s*'([^']+)'/)[1], key = env.match(/supabaseKey:\s*\n?\s*'([^']+)'/)[1];
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email: 'superadmin@checklist.test', password: 'Checklist#Admin2026' });
  if (error) throw error;
  return sb;
}

async function reset(sb) {
  const { data: acts } = await sb.from('legal_acts').select('id, legal_act_documents(storage_path)').eq('reference', ACT.reference);
  for (const a of acts ?? []) {
    const paths = a.legal_act_documents.map((d) => d.storage_path);
    if (paths.length) await sb.storage.from('legislation').remove(paths);
    const { error } = await sb.from('legal_acts').delete().eq('id', a.id);
    console.log('removed act', a.id, error ? error.message : 'ok');
  }
}

// run only when called directly (record-legislacao.mjs imports the data above)
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const cmd = process.argv[2];
  const sb = await client();
  if (cmd === 'reset') {
    await reset(sb);
  } else if (cmd === 'load') {
    await reset(sb);
    const { data: act, error } = await sb.from('legal_acts').insert(ACT).select('id').single();
    if (error) throw error;
    for (const d of DOCS) {
      const path = `${act.id}/${randomUUID()}/${d.name}`;
      const body = readFileSync(filePath(d));
      const up = await sb.storage.from('legislation').upload(path, body, { contentType: 'application/pdf' });
      if (up.error) throw up.error;
      const { error: e } = await sb.from('legal_act_documents').insert({
        act_id: act.id, role: d.role, diploma: d.diploma, publication: d.publication, published_on: d.published_on, effect: d.effect,
        storage_path: path, original_name: d.name, mime_type: 'application/pdf', size_bytes: body.length,
      });
      console.log(d.role, d.diploma, e ? e.message : 'ok');
    }
    console.log('act', act.id);
  } else {
    console.log('usage: node scripts/presentation/legislation-demo.mjs load|reset');
  }
}
