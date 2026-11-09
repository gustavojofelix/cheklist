// Builds docs/presentation/Checklist-Legal-Acasalamento.pptx: document pairing in the Legislação module,
// with the LACI047 example (Decreto n.º 38.088 — Código das Execuções Fiscais — and three alterations).
//   node scripts/presentation/capture-legislacao.mjs && node scripts/presentation/assets.mjs
//   PPTXGENJS=<…>/node_modules/pptxgenjs APPLY_THEME=<…>/apply_theme.js node scripts/presentation/build-deck-legislacao.cjs
const path = require('node:path');
const { applyTheme } = require(process.env.APPLY_THEME || './apply_theme.js');
const { createDeck, ROOT, D, M } = require('./lib/deck.cjs');

const OUT = path.join(ROOT, 'docs/presentation/Checklist-Legal-Acasalamento.pptx');
const { pres, C, THEME, sec, cover, content, divider, points, caption, screen, twoScreens, card } =
  createDeck('Checklist Legal — Acasalamento de documentos');

const CHAIN = [
  { tag: 'Original', diploma: 'Decreto n.º 38.088', date: '12/12/1950', pub: 'Ministério das Colónias', effect: 'Aprova o Código das Execuções Fiscais', tone: 'FCD116', ink: '141414' },
  { tag: 'Alteração 1', diploma: 'Decreto n.º 38.295', date: '04/08/1951', pub: 'Boletim Oficial de Moçambique, I Série, n.º 31', effect: 'Substitui o artigo 1.º', tone: '0D7744', ink: 'FFFFFF' },
  { tag: 'Alteração 2', diploma: 'Decreto n.º 46.849', date: '29/01/1966', pub: 'Ministério do Ultramar', effect: 'Revoga o § 1.º do artigo 269.º', tone: '0D7744', ink: 'FFFFFF' },
  { tag: 'Alteração 3', diploma: 'Decreto-Lei n.º 1/2013', date: '04/07/2013', pub: 'Boletim da República, I Série, n.º 53', effect: 'Revoga os artigos 147.º e 148.º', tone: '0D7744', ink: 'FFFFFF' },
  { tag: 'Versão revista', diploma: 'Decreto n.º 38.088 — revisto', date: '', pub: 'Texto consolidado (Mobilelegis)', effect: 'As três alterações incorporadas', tone: '07472A', ink: 'FFFFFF' },
];

// ============================================================ abertura
sec('Abertura');
{
  const s = cover();
  s.addText('Acasalamento de documentos', { placeholder: 'title' });
  s.addText('O diploma original, as leis que o alteram e o texto revisto — ligados, por ordem, num só lugar.', { placeholder: 'body' });
  s.addText('Exemplo: Código das Execuções Fiscais (LACI047) · Novembro 2026', { placeholder: 'meta' });
  s.addNotes('Vamos ver como a plataforma liga um diploma original às alterações que recebeu ao longo do tempo, até ao texto revisto que está em vigor. O exemplo é o Código das Execuções Fiscais.');
}
{
  const s = content('O problema', 'Um diploma raramente fica como foi publicado',
    'O Código das Execuções Fiscais foi aprovado em 1950 e alterado em 1951, 1966 e 2013, por diplomas diferentes, publicados em jornais oficiais diferentes. Para saber o texto em vigor é preciso juntar as peças pela ordem certa.');
  const years = [['1950', 'Original', 'FCD116', '141414'], ['1951', 'Alteração', '0D7744', 'FFFFFF'], ['1966', 'Alteração', '0D7744', 'FFFFFF'], ['2013', 'Alteração', '0D7744', 'FFFFFF']];
  s.addShape(pres.shapes.LINE, { x: 1.2, y: 2.75, w: 9.4, h: 0, line: { color: 'C9BC9F', width: 3 } });
  years.forEach(([y, l, fill, ink], i) => {
    const x = 0.75 + i * 2.6;
    s.addShape(pres.shapes.OVAL, { x: x + 0.45, y: 2.25, w: 1.0, h: 1.0, fill: { color: fill }, line: { color: 'FFFFFF', width: 3 } });
    s.addText(y, { x, y: 3.4, w: 1.9, h: 0.5, fontSize: 22, bold: true, color: C.text2, align: 'center', margin: 0, isTextBox: true });
    s.addText(l, { x, y: 3.9, w: 1.9, h: 0.35, fontSize: 13, color: C.accent6, align: 'center', margin: 0, isTextBox: true });
    s.addText(String(i === 0 ? '★' : i), { x: x + 0.45, y: 2.25, w: 1.0, h: 1.0, fontSize: 20, bold: true, color: ink, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
  });
  card(s, 10.75, 1.95, 2.0, 1.6, '07472A');
  s.addText('?', { x: 10.75, y: 1.95, w: 2.0, h: 1.0, fontSize: 40, bold: true, color: C.accent2, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
  s.addText('Texto em vigor', { x: 10.75, y: 2.9, w: 2.0, h: 0.5, fontSize: 13, bold: true, color: C.background1, align: 'center', margin: 0, isTextBox: true });
  card(s, 0.6, 4.75, 12.15, 1.85, 'FFFFFF', 'E9DFCC');
  s.addText([
    { text: 'Peças espalhadas: ', options: { bold: true, color: C.accent3 } },
    { text: 'cada alteração vive num jornal oficial diferente (Boletim Oficial, Diário do Governo, Boletim da República).', options: { breakLine: true } },
    { text: 'Ordem difícil: ', options: { bold: true, color: C.accent3 } },
    { text: 'as alterações chegam fora de ordem e citam o original por números e datas.', options: { breakLine: true } },
    { text: 'Risco: ', options: { bold: true, color: C.accent3 } },
    { text: 'aplicar um artigo que já foi revogado — por exemplo os artigos 147.º e 148.º, revogados em 2013.' },
  ], { x: 0.95, y: 4.95, w: 11.5, h: 1.5, fontSize: 15, color: C.text1, paraSpaceAfter: 6, valign: 'top', margin: 0, isTextBox: true });
}
{
  const s = content('A ideia', 'Original + alterações → versão revista',
    'O acasalamento liga cada alteração ao diploma original e ordena-as pela data de publicação. No fim fica a versão revista, o texto consolidado. Cada peça mantém o seu PDF e a indicação do que mudou.');
  const blocks = [['Original', 'O diploma tal como foi publicado', 'FCD116', '141414', 'Um por diploma'],
    ['Alterações', 'Cada uma ligada ao original, numeradas por data', '0D7744', 'FFFFFF', 'Quantas forem precisas'],
    ['Versão revista', 'O texto consolidado em vigor', '07472A', 'FFFFFF', 'Uma por diploma']];
  blocks.forEach(([t, d, fill, ink, rule], i) => {
    const x = 0.6 + i * 4.35;
    card(s, x, 1.9, 3.6, 3.2, fill);
    s.addText(t, { x: x + 0.3, y: 2.15, w: 3.0, h: 0.6, fontSize: 26, bold: true, color: ink, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.3, y: 2.9, w: 3.0, h: 1.2, fontSize: 16, color: ink, valign: 'top', margin: 0, isTextBox: true });
    s.addText(rule, { x: x + 0.3, y: 4.4, w: 3.0, h: 0.4, fontSize: 12, bold: true, color: ink, margin: 0, isTextBox: true });
    if (i < 2) s.addText(i === 0 ? '+' : '→', { x: x + 3.62, y: 3.0, w: 0.7, h: 0.8, fontSize: 36, bold: true, color: C.accent1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
  });
  s.addText([
    { text: 'Regras garantidas pela base de dados: ', options: { bold: true, color: C.text2 } },
    { text: 'um só original e uma só versão revista por diploma; nenhuma alteração com data anterior ao original.' },
  ], { x: 0.6, y: 5.55, w: 12.1, h: 0.8, fontSize: 15, color: C.text1, margin: 0, isTextBox: true });
}
{
  const s = content('O exemplo', 'LACI047 — Código das Execuções Fiscais',
    'Os cinco documentos do exemplo. Repare que os ficheiros vieram numerados ao contrário da cronologia: a "alteração 1" é a mais recente. A plataforma ordena pela data, por isso a numeração no ecrã segue a cronologia.');
  const H = { bold: true, color: 'FFFFFF', fill: { color: '07472A' }, fontSize: 12 };
  s.addTable([[{ text: 'Papel', options: H }, { text: 'Diploma', options: H }, { text: 'Data', options: H }, { text: 'Publicação', options: H }, { text: 'O que muda', options: H }],
    ...CHAIN.map((c, i) => [
      { text: c.tag, options: { bold: true, color: c.tone === 'FCD116' ? '8A6D00' : c.tone, fill: { color: i % 2 ? 'F4EEE2' : 'FFFFFF' } } },
      { text: c.diploma, options: { bold: true, fill: { color: i % 2 ? 'F4EEE2' : 'FFFFFF' } } },
      { text: c.date || '—', options: { fill: { color: i % 2 ? 'F4EEE2' : 'FFFFFF' } } },
      { text: c.pub, options: { fill: { color: i % 2 ? 'F4EEE2' : 'FFFFFF' } } },
      { text: c.effect, options: { fill: { color: i % 2 ? 'F4EEE2' : 'FFFFFF' } } }])],
  { x: 0.6, y: 1.55, w: 12.15, colW: [1.6, 2.9, 1.3, 3.35, 3.0], rowH: 0.62, fontSize: 12.5, color: '141414',
    border: { type: 'solid', color: 'E9DFCC', pt: 0.75 }, margin: [0.05, 0.12, 0.05, 0.12], valign: 'middle' });
  s.addText('Os ficheiros chegaram como “ALTERAÇÃO 1, 2, 3” — de 2013 para 1951. No ecrã, a plataforma reordena-os pela data de publicação.',
    { x: 0.6, y: 5.6, w: 12.1, h: 0.6, fontSize: 13, italic: true, color: C.accent6, margin: 0, isTextBox: true });
}

// ============================================================ na plataforma
sec('Na plataforma');
divider('01', 'Na plataforma', 'O módulo Legislação: a equipa monta a cadeia no back office e os clientes consultam-na no front office.',
  'Agora a plataforma: primeiro o back office, onde a equipa monta a cadeia, depois o que o cliente vê.');
screen('Back office', 'Biblioteca de legislação', 'leg-01-admin-list', [
  ['Um cartão por diploma', 'Referência interna, título, tipo, número e data.'],
  ['Acasalamento à vista', 'Original + n alterações → versão revista, em cada cartão.'],
  ['Pesquisa', 'Por título, referência ou número.'],
  ['Só a equipa edita', 'Os clientes apenas consultam.'],
], 'A biblioteca mostra cada diploma com o resumo do acasalamento: se tem original, quantas alterações e se já há versão revista.');
screen('Back office', 'A cadeia do diploma', 'leg-02-admin-detail', [
  ['Resumo numa linha', 'Original + Alteração 1 + 2 + 3 → Versão revista.'],
  ['Ordem por data', 'As alterações são numeradas pela data de publicação, não pela ordem de carregamento.'],
  ['Ligada ao original', 'Cada alteração indica que altera o Decreto n.º 38.088.'],
  ['PDF a um clique', 'Cada documento abre com uma ligação temporária.'],
], 'O detalhe mostra a linha do acasalamento e, por baixo, a cadeia completa: original, alterações por data e a versão revista.');
screen('Back office', 'Adicionar um documento à cadeia', 'leg-04-add-document', [
  ['Papel do documento', 'Original, alteração ou versão revista.'],
  ['Diploma e publicação', 'Ex.: Decreto-Lei n.º 1/2013, Boletim da República, I Série, n.º 53.'],
  ['O que altera', 'Ex.: revoga os artigos 147.º e 148.º.'],
  ['Validação', 'Recusa alterações com data anterior ao original.'],
], 'Para acrescentar uma peça escolhe-se o papel, o diploma, a publicação, a data, o efeito e o ficheiro. O original e a versão revista só podem existir uma vez.');
twoScreens('Front office', 'O cliente consulta a mesma cadeia', [
  ['leg-05-client-list', 'Menu Legislação', 'A biblioteca, em modo de leitura'],
  ['leg-07-client-chain', 'Detalhe do diploma', 'O que mudou, quando e por qual diploma'],
], 'Os clientes encontram a biblioteca no menu Legislação. Veem a cadeia completa e abrem qualquer PDF, incluindo o texto revisto, sem poder alterar nada.');
{
  const s = content('Telemóvel', 'A cadeia no ecrã pequeno',
    'No telemóvel a cadeia é apresentada de cima para baixo: o original, as alterações por data e a versão revista no fim.');
  const h = 5.0, w = h * 920 / 1920;
  ['leg-02-detail', 'leg-03-chain'].forEach((n, i) => s.addImage({ path: M(n), x: 0.8 + i * (w + 0.4), y: 1.45, w, h, altText: n }));
  points(s, [
    ['De cima para baixo', 'Original no topo, alterações numeradas, versão revista no fim.'],
    ['Mesmo conteúdo', 'Diploma, publicação, data, efeito e PDF.'],
    ['Sempre à mão', 'Consulta rápida durante reuniões ou auditorias.'],
  ], 7.0, 2.0, 5.6, 4.0, 15);
}

// ============================================================ segurança e próximos passos
sec('Segurança e próximos passos');
{
  const s = content('Segurança', 'Regras na base de dados, não só no ecrã',
    'As regras do acasalamento estão na própria base de dados, por isso valem em qualquer canal: só a equipa da plataforma edita, os clientes leem, a ordem das datas é verificada e cada alteração fica no histórico de auditoria.');
  const rows = [
    ['Quem edita', 'Só a equipa da plataforma pode criar diplomas e carregar documentos (regras RLS).', '0D7744'],
    ['Quem lê', 'Qualquer utilizador autenticado consulta a biblioteca e os PDFs.', 'FCD116'],
    ['Coerência', 'Um original e uma versão revista por diploma; nenhuma alteração antes do original.', 'C0102B'],
    ['Ficheiros', 'Armazenamento privado; cada PDF abre com uma ligação de 2 minutos.', '141414'],
    ['Auditoria e testes', 'Alterações registadas no histórico encadeado; 7 novos testes automáticos (74 no total).', '16955A'],
  ];
  rows.forEach(([t, d, c], i) => {
    const y = 1.55 + i * 1.0;
    card(s, 0.6, y, 12.15, 0.86, 'FFFFFF', 'E9DFCC');
    s.addShape(pres.shapes.RECTANGLE, { x: 0.95, y: y + 0.27, w: 0.32, h: 0.32, rotate: 45, fill: { color: c }, line: { color: c, width: 0 } });
    s.addText(t, { x: 1.6, y, w: 3.0, h: 0.86, fontSize: 16, bold: true, color: C.text1, valign: 'middle', margin: 0, isTextBox: true });
    s.addText(d, { x: 4.6, y, w: 7.9, h: 0.86, fontSize: 13.5, color: C.accent6, valign: 'middle', margin: 0, isTextBox: true });
  });
}
{
  const s = content('Próximos passos', 'Para onde pode evoluir', 'Ideias para a próxima fase: ligar diplomas às obrigações da checklist, avisar os clientes quando sai uma alteração, e usar a IA para resumir o que mudou e ler digitalizações antigas.');
  const steps = [
    ['1', 'Base legal na checklist', 'Ligar cada obrigação da ficha ao diploma que a fundamenta.'],
    ['2', 'Avisos de alteração', 'E-mail aos clientes quando um diploma que usam é alterado.'],
    ['3', 'Resumo pela IA', 'O assistente explica o que mudou entre o original e a versão revista.'],
    ['4', 'OCR das digitalizações', 'Pesquisa no texto dos PDFs antigos, como o de 1950.'],
  ];
  s.addShape(pres.shapes.LINE, { x: 2.05, y: 2.75, w: 9.24, h: 0, line: { color: 'C9BC9F', width: 2, dashType: 'dash' } });
  steps.forEach(([n, t, d], i) => {
    const x = 0.6 + i * 3.08;
    s.addShape(pres.shapes.OVAL, { x: x + 0.95, y: 2.25, w: 1.0, h: 1.0, fill: { color: ['0D7744', 'FCD116', 'C0102B', '141414'][i] }, line: { color: 'FFFFFF', width: 3 } });
    s.addText(n, { x: x + 0.95, y: 2.25, w: 1.0, h: 1.0, fontSize: 30, bold: true, color: i === 1 ? C.text1 : C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    card(s, x, 3.55, 2.9, 2.45, 'FFFFFF', 'E9DFCC');
    s.addText(t, { x: x + 0.25, y: 3.8, w: 2.4, h: 0.8, fontSize: 17, bold: true, color: C.text2, valign: 'top', margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.25, y: 4.6, w: 2.4, h: 1.25, fontSize: 13.5, color: C.accent6, valign: 'top', margin: 0, isTextBox: true });
  });
}
{
  const s = cover();
  s.addText('Obrigado', { placeholder: 'title' });
  s.addText('O original, as alterações e o texto em vigor, lado a lado.', { placeholder: 'body' });
  s.addText('Vídeo de demonstração disponível: Checklist-Legal-Acasalamento-ptBR.mp4', { placeholder: 'meta' });
  s.addNotes('Obrigado. Podemos ver o vídeo de demonstração ou abrir a plataforma ao vivo.');
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('written', OUT);
})();
