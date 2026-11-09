// Demo material for the "original + 3 alterations" walkthrough (DEV project only).
//   node scripts/presentation/gazette-demo.mjs pdfs    writes 4 fictitious example PDFs to docs/presentation/gazette-demo/
//   node scripts/presentation/gazette-demo.mjs reset   removes the demo company's gazette entries (their files go to the recycle bin)
// The PDFs are invented examples, marked as such on every page; they are not copies of real publications.
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

export const PUBLICATIONS = [
  { file: 'BR_2019_Constituicao_Demo_Consultores.pdf', type: 'constituicao_quotas', date: '2019-03-12', series: 'III Série, n.º 50',
    summary: 'Constituição da Demo Consultores, Lda, sociedade por quotas, com o capital social de 500 000,00 MZN.',
    heading: 'Constituição de sociedade', body: [
      'É constituída a sociedade comercial por quotas denominada Demo Consultores, Limitada, com sede em Maputo.',
      'Artigo terceiro — O objecto da sociedade é a prestação de serviços de consultoria jurídica e empresarial.',
      'Artigo quarto — O capital social, integralmente subscrito, é de 500 000,00 MZN, dividido em duas quotas.',
      'Artigo sétimo — A administração da sociedade é exercida por um administrador único.'] },
  { file: 'BR_2021_Alteracao_Orgaos_Sociais.pdf', type: 'alteracao_orgao', date: '2021-06-18', series: 'III Série, n.º 116',
    summary: 'A administração passa a ser exercida por um conselho de administração de três membros.',
    heading: 'Alteração dos órgãos sociais', body: [
      'Por deliberação da assembleia geral, o artigo sétimo do pacto social passa a ter a seguinte redacção:',
      'Artigo sétimo — A administração da sociedade é exercida por um conselho de administração composto por três membros.'] },
  { file: 'BR_2023_Aumento_Capital_Social.pdf', type: 'alteracao_capital', date: '2023-02-09', series: 'III Série, n.º 28',
    summary: 'Aumento do capital social de 500 000,00 MZN para 1 000 000,00 MZN.',
    heading: 'Aumento do capital social', body: [
      'A assembleia geral deliberou aumentar o capital social em 500 000,00 MZN, por entradas em dinheiro.',
      'Artigo quarto — O capital social, integralmente subscrito e realizado, é de 1 000 000,00 MZN.'] },
  { file: 'BR_2025_Alteracao_Pacto_Social.pdf', type: 'alteracao_pacto', date: '2025-09-22', series: 'III Série, n.º 183',
    summary: 'Alteração do objecto social (artigo terceiro): passa a incluir a formação profissional.',
    heading: 'Alteração do pacto social', body: [
      'Por deliberação da assembleia geral, o artigo terceiro do pacto social passa a ter a seguinte redacção:',
      'Artigo terceiro — O objecto da sociedade é a prestação de serviços de consultoria jurídica e empresarial e a formação profissional.'] },
];
export const PDF_DIR = 'docs/presentation/gazette-demo';

const cmd = process.argv[2];
if (cmd === 'pdfs') {
  mkdirSync(PDF_DIR, { recursive: true });
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage();
  for (const pub of PUBLICATIONS) {
    const d = new Date(pub.date + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
    await p.setContent(`<!doctype html><html lang="pt"><meta charset="utf-8"><style>
      @page { size: A4; margin: 22mm 20mm; }
      body { font: 11.5pt/1.55 Georgia, 'Times New Roman', serif; color: #141414; }
      .demo { position: fixed; top: 40%; left: 0; right: 0; text-align: center; transform: rotate(-30deg); font: 700 64pt Arial; color: rgba(192,16,43,.12); }
      .note { border: 1.5px solid #c0102b; color: #c0102b; font: 600 9pt Arial; padding: 6px 10px; margin-bottom: 18px; }
      header { text-align: center; border-bottom: 2px solid #141414; padding-bottom: 10px; margin-bottom: 18px; }
      header .t { font: 700 15pt Georgia; letter-spacing: .04em; } header .s { font: 10pt Arial; color: #444; margin-top: 4px; }
      h1 { font: 700 13pt Georgia; text-transform: uppercase; text-align: center; margin: 20px 0 6px; }
      h2 { font: 400 11pt Georgia; text-align: center; margin: 0 0 16px; }
      p { text-align: justify; margin: 0 0 10px; } footer { margin-top: 28px; font: 9pt Arial; color: #555; }
    </style><body><div class="demo">EXEMPLO</div>
      <div class="note">DOCUMENTO FICTÍCIO PARA DEMONSTRAÇÃO DA PLATAFORMA CHECKLIST LEGAL — sem qualquer valor legal.</div>
      <header><div class="t">Extracto de publicação (exemplo)</div><div class="s">${pub.series} · ${d}</div></header>
      <h1>${pub.heading}</h1><h2>Demo Consultores, Limitada</h2>
      ${pub.body.map((x) => `<p>${x}</p>`).join('')}
      <footer>Exemplo criado para demonstração. Empresa e factos fictícios.</footer></body></html>`);
    await p.pdf({ path: `${PDF_DIR}/${pub.file}`, format: 'A4', printBackground: true });
    console.log('pdf', pub.file);
  }
  await b.close();
} else if (cmd === 'reset') {
  const env = readFileSync('src/environments/environment.ts', 'utf8');
  const url = env.match(/supabaseUrl:\s*'([^']+)'/)[1], key = env.match(/supabaseKey:\s*\n?\s*'([^']+)'/)[1];
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error: e0 } = await sb.auth.signInWithPassword({ email: 'demo@checklist.test', password: 'Checklist#Demo2026' });
  if (e0) throw e0;
  const { data: entries, error } = await sb.from('checklist_items').select('id, catalog_code, document_items(document_id)').eq('is_official_gazette', true);
  if (error) throw error;
  for (const e of entries) {
    for (const d of e.document_items) await sb.rpc('delete_document', { doc: d.document_id });
    const { error: de } = await sb.from('checklist_items').delete().eq('id', e.id);
    console.log('removed', e.catalog_code, de ? de.message : 'ok');
  }
  console.log('gazette entries removed:', entries.length);
} else {
  console.log('usage: node scripts/presentation/gazette-demo.mjs pdfs|reset');
}
