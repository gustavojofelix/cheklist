// Builds docs/presentation/Checklist-Legal-Apresentacao.pptx from the captured screens.
//   node scripts/presentation/assets.mjs        (once, renders frames/backgrounds)
//   PPTXGENJS=<path to node_modules/pptxgenjs> node scripts/presentation/build-deck.cjs
const path = require('node:path');
const pptxgen = require(process.env.PPTXGENJS || 'pptxgenjs');
const { applyTheme } = require(process.env.APPLY_THEME || './apply_theme.js');

const ROOT = path.resolve(__dirname, '../..');
const A = (f) => path.join(ROOT, 'docs/presentation/assets', f);
const D = (n) => A(`framed/d-${n}.png`);   // framed desktop screen, 1488 x 992 (3:2)
const M = (n) => A(`framed/m-${n}.png`);   // framed phone screen, 920 x 1920
const OUT = path.join(ROOT, 'docs/presentation/Checklist-Legal-Apresentacao.pptx');

const THEME = {
  name: 'Checklist Legal Moçambique',
  headFontFace: 'Calibri',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '141414', lt1: 'FFFFFF', dk2: '07472A', lt2: 'FBF8F2',
    accent1: '0D7744', accent2: 'FCD116', accent3: 'C0102B', accent4: '16955A', accent5: '8A6D00', accent6: '5B5B5B',
    hlink: '0D7744', folHlink: '095E36',
  },
};

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';                       // 13.333 x 7.5 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = 'Checklist Legal — Apresentação da plataforma';
pres.author = 'Checklist Legal';
pres.company = 'Checklist Legal Moçambique';
const C = pres.SchemeColor;
const W = 13.333;

// ------------------------------------------------------------------ layouts
pres.defineSlideMaster({
  title: 'CAPA',
  background: { path: A('bg-cover.png') },
  objects: [
    { image: { x: 0, y: 0, w: W, h: 0.08, path: A('stripe.png') } },
    { image: { x: 0.8, y: 0.85, w: 0.75, h: 0.75, path: A('logo.png') } },
    { text: { text: 'Checklist Legal', options: { x: 1.7, y: 0.86, w: 5, h: 0.42, fontSize: 22, bold: true, color: C.background1, margin: 0 } } },
    { text: { text: 'MOÇAMBIQUE', options: { x: 1.7, y: 1.28, w: 5, h: 0.3, fontSize: 11, bold: true, charSpacing: 4, color: C.accent2, margin: 0 } } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 2.35, w: 7.6, h: 2.0, fontSize: 44, bold: true, color: C.background1, valign: 'top', align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.8, y: 4.55, w: 7.0, h: 1.3, fontSize: 18, color: 'FFE46B', valign: 'top', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'meta', type: 'body', x: 0.8, y: 6.55, w: 7.0, h: 0.4, fontSize: 12, color: C.background1, margin: 0 }, text: '' } },
  ],
});

pres.defineSlideMaster({
  title: 'SECCAO',
  background: { path: A('bg-divider.png') },
  objects: [
    { image: { x: 0, y: 0, w: W, h: 0.08, path: A('stripe.png') } },
    { placeholder: { options: { name: 'num', type: 'body', x: 0.8, y: 1.9, w: 3, h: 1.3, fontSize: 80, bold: true, color: C.accent2, margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 3.3, w: 9, h: 1.0, fontSize: 40, bold: true, color: C.background1, align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.8, y: 4.4, w: 7.5, h: 1.2, fontSize: 18, color: 'D2EEDD', valign: 'top', margin: 0 }, text: '' } },
    { image: { x: 0, y: 7.38, w: W, h: 0.12, path: A('band.png') } },
  ],
});

pres.defineSlideMaster({
  title: 'CONTEUDO',
  background: { color: 'FBF8F2' },
  objects: [
    { image: { x: 0, y: 0, w: W, h: 0.06, path: A('stripe.png') } },
    { placeholder: { options: { name: 'kicker', type: 'body', x: 0.6, y: 0.32, w: 10, h: 0.3, fontSize: 11, bold: true, charSpacing: 3, color: C.accent1, margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.62, w: 12.1, h: 0.7, fontSize: 28, bold: true, color: C.text2, valign: 'top', align: 'left', margin: 0 }, text: '' } },
    { image: { x: 0.6, y: 6.98, w: 0.26, h: 0.26, path: A('logo.png') } },
    { text: { text: 'Checklist Legal · Moçambique', options: { x: 0.95, y: 6.97, w: 5, h: 0.28, fontSize: 10, color: C.accent6, margin: 0 } } },
    { image: { x: 0, y: 7.42, w: W, h: 0.08, path: A('band.png') } },
  ],
  slideNumber: { x: 12.2, y: 6.97, w: 0.55, h: 0.28, fontSize: 10, color: '5B5B5B', align: 'right' },
});

// ------------------------------------------------------------------ helpers
let section = '';
function sec(title) { section = title; pres.addSection({ title }); }
function content(kicker, title, notes) {
  const s = pres.addSlide({ masterName: 'CONTEUDO', sectionTitle: section });
  s.addText(kicker.toUpperCase(), { placeholder: 'kicker' });
  s.addText(title, { placeholder: 'title' });
  if (notes) s.addNotes(notes);
  return s;
}
function divider(num, title, body, notes) {
  const s = pres.addSlide({ masterName: 'SECCAO', sectionTitle: section });
  s.addText(num, { placeholder: 'num' });
  s.addText(title, { placeholder: 'title' });
  s.addText(body, { placeholder: 'body' });
  if (notes) s.addNotes(notes);
  return s;
}
/** Feature list: bold green heading + one line of description per item. */
function points(s, items, x, y, w, h, size = 13) {
  const runs = [];
  items.forEach(([head, desc], i) => {
    runs.push({ text: head, options: { bold: true, color: C.accent1, fontSize: size + 2, breakLine: true } });
    runs.push({ text: desc, options: { color: C.text1, fontSize: size, breakLine: i < items.length - 1, paraSpaceAfter: 12 } });
  });
  s.addText(runs, { x, y, w, h, valign: 'top', margin: 0, isTextBox: true, objectName: 'points' });
}
function caption(s, text, x, y, w, sub) {
  const runs = [{ text, options: { bold: true, fontSize: 13, color: C.text2, breakLine: !!sub } }];
  if (sub) runs.push({ text: sub, options: { fontSize: 11, color: C.accent6 } });
  s.addText(runs, { x, y, w, h: sub ? 0.6 : 0.32, align: 'center', valign: 'top', margin: 0, isTextBox: true });
}
/** One large desktop screen on the right, a feature list on the left. */
function screen(kicker, title, shot, items, notes) {
  const s = content(kicker, title, notes);
  points(s, items, 0.6, 1.65, 3.85, 5.1);
  s.addImage({ path: D(shot), x: 4.7, y: 1.4, w: 8.2, h: 5.467, altText: title, objectName: 'screen' });
  return s;
}
function twoScreens(kicker, title, shots, notes) {
  const s = content(kicker, title, notes);
  shots.forEach(([shot, cap, sub], i) => {
    const x = 0.45 + i * 6.25;
    s.addImage({ path: D(shot), x, y: 1.5, w: 6.2, h: 4.133, altText: cap });
    caption(s, cap, x + 0.3, 5.75, 5.6, sub);
  });
  return s;
}
function threeScreens(kicker, title, shots, notes) {
  const s = content(kicker, title, notes);
  shots.forEach(([shot, cap, sub], i) => {
    const x = 0.45 + i * 4.16;
    s.addImage({ path: D(shot), x, y: 2.05, w: 4.1, h: 2.733, altText: cap });
    caption(s, cap, x + 0.15, 4.95, 3.8, sub);
  });
  return s;
}
function phones(kicker, title, shots, notes) {
  const s = content(kicker, title, notes);
  const h = 4.95, w = h * 920 / 1920, gap = (12.2 - shots.length * w) / (shots.length - 1);
  shots.forEach(([shot, cap], i) => {
    const x = 0.55 + i * (w + gap);
    s.addImage({ path: M(shot), x, y: 1.4, w, h, altText: cap });
    caption(s, cap, x - 0.1, 6.42, w + 0.2);
  });
  return s;
}
function card(s, x, y, w, h, fill, line) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: line ?? fill, width: 1 } });
}

// ================================================================== 1. abertura
sec('Abertura');
{
  const s = pres.addSlide({ masterName: 'CAPA', sectionTitle: section });
  s.addText('Conformidade legal das empresas, num só lugar', { placeholder: 'title' });
  s.addText('A plataforma moçambicana que organiza obrigações, documentos e prazos — no computador e no telemóvel.', { placeholder: 'body' });
  s.addText('Apresentação da plataforma · Novembro 2026', { placeholder: 'meta' });
  s.addNotes('Boas-vindas. O Checklist Legal é a plataforma que ajuda empresas e consultores em Moçambique a manter a conformidade legal: cada obrigação, cada documento e cada prazo num só lugar, com alertas antes de expirar.');
}
{
  const s = content('Porquê', 'O problema e a nossa resposta',
    'Hoje a conformidade vive em pastas, e-mails e folhas de cálculo. Prazos passam despercebidos e, numa auditoria ou due diligence, ninguém encontra a certidão certa. O Checklist Legal transforma isto num processo vivo e auditável.');
  card(s, 0.6, 1.6, 5.9, 4.95, 'FFFFFF', 'E9DFCC');
  s.addText('Hoje', { x: 0.95, y: 1.85, w: 5.2, h: 0.45, fontSize: 20, bold: true, color: C.accent3, margin: 0, isTextBox: true });
  s.addText([
    { text: 'Documentos espalhados por pastas, e-mails e papel', options: { bullet: true, breakLine: true } },
    { text: 'Licenças e certidões que expiram sem aviso', options: { bullet: true, breakLine: true } },
    { text: 'Sem histórico de quem alterou o quê', options: { bullet: true, breakLine: true } },
    { text: 'Relatórios para a administração feitos à mão', options: { bullet: true, breakLine: true } },
    { text: 'Cada sucursal com o seu próprio controlo', options: { bullet: true } },
  ], { x: 0.95, y: 2.45, w: 5.3, h: 3.8, fontSize: 16, color: C.text1, paraSpaceAfter: 12, valign: 'top', margin: 0, isTextBox: true });
  card(s, 6.85, 1.6, 5.9, 4.95, '07472A');
  s.addText('Com o Checklist Legal', { x: 7.2, y: 1.85, w: 5.3, h: 0.45, fontSize: 20, bold: true, color: C.accent2, margin: 0, isTextBox: true });
  s.addText([
    { text: 'Uma ficha por entidade com todas as obrigações', options: { bullet: true, breakLine: true } },
    { text: 'Estado em tempo real: Regular, Atenção, Crítico', options: { bullet: true, breakLine: true } },
    { text: 'Alertas por e-mail antes do fim da validade', options: { bullet: true, breakLine: true } },
    { text: 'Registo de actividade inalterável e exportável', options: { bullet: true, breakLine: true } },
    { text: 'Relatórios em PDF e Word num clique, com IA', options: { bullet: true } },
  ], { x: 7.2, y: 2.45, w: 5.3, h: 3.8, fontSize: 16, color: C.background1, paraSpaceAfter: 12, valign: 'top', margin: 0, isTextBox: true });
}
{
  const s = content('Em números', 'Uma plataforma completa, pronta para produção',
    'Alguns números da plataforma: um modelo de checklist com 39 obrigações em 5 categorias, duas aplicações (cliente e back office), dois idiomas, e uma bateria de testes automáticos que valida segurança e regras de negócio em cada alteração.');
  const stats = [
    ['39', 'obrigações legais no modelo base', '5 categorias: Legal, Societário, Fiscal, Laboral, Licenciamento'],
    ['2', 'aplicações integradas', 'Front office para clientes e back office para a equipa da plataforma'],
    ['PT · EN', 'bilingue', 'Português de Moçambique e inglês, trocados em tempo real'],
    ['82', 'testes automáticos', '67 testes de segurança na base de dados + 15 testes de ponta a ponta'],
  ];
  stats.forEach(([n, l, d], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.75, 2.9, 4.6, 'FFFFFF', 'E9DFCC');
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.75, w: 2.9, h: 0.12, fill: { color: ['0D7744', 'FCD116', 'C0102B', '141414'][i] }, line: { color: ['0D7744', 'FCD116', 'C0102B', '141414'][i], width: 0 } });
    s.addText(n, { x: x + 0.25, y: 2.2, w: 2.4, h: 1.1, fontSize: n.length > 3 ? 44 : 60, bold: true, color: C.accent1, margin: 0, isTextBox: true });
    s.addText(l, { x: x + 0.25, y: 3.4, w: 2.4, h: 0.75, fontSize: 16, bold: true, color: C.text1, valign: 'top', margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.25, y: 4.25, w: 2.4, h: 1.8, fontSize: 12.5, color: C.accent6, valign: 'top', margin: 0, isTextBox: true });
  });
}
{
  const s = content('Visão geral', 'Todos os módulos da plataforma',
    'Mapa dos módulos. À esquerda o front office, usado pelas empresas e consultores. À direita o back office, usado pela equipa da plataforma para gerir clientes, modelos de checklist, planos e pagamentos.');
  const fo = [['Painel', 'Indicadores e alertas'], ['Empresa', 'Dados, utilizadores, notificações'], ['Entidades', 'Sede e sucursais'], ['Ficha da entidade', 'Obrigações, prazos, estados'],
    ['Documentos e OCR', 'Anexos lidos pela IA'], ['Relatórios', 'PDF e Word'], ['Registos', 'Histórico de actividade'], ['Assistente de IA', 'Perguntas sobre a empresa'],
    ['Documentos apagados', 'Recuperação'], ['Subscrições', 'Planos e pagamento']];
  const bo = [['Organizações', 'Clientes e acesso'], ['Modelos de checklist', 'Versões publicadas'], ['Planos', 'Limites e preços'], ['Vouchers', 'Descontos'],
    ['Pagamentos', 'Stripe, SISLOG, transferência'], ['Equipa', 'Papéis internos'], ['Definições e e-mails', 'Configuração'], ['Registos', 'Auditoria global']];
  s.addText('FRONT OFFICE · clientes', { x: 0.6, y: 1.5, w: 7.5, h: 0.32, fontSize: 12, bold: true, charSpacing: 2, color: C.accent1, margin: 0, isTextBox: true });
  fo.forEach(([t, d], i) => {
    const x = 0.6 + (i % 2) * 3.75, y = 1.92 + Math.floor(i / 2) * 0.98;
    card(s, x, y, 3.6, 0.86, 'FFFFFF', 'E9DFCC');
    s.addShape(pres.shapes.OVAL, { x: x + 0.18, y: y + 0.25, w: 0.36, h: 0.36, fill: { color: '0D7744' }, line: { color: '0D7744', width: 0 } });
    s.addText(String(i + 1), { x: x + 0.18, y: y + 0.25, w: 0.36, h: 0.36, fontSize: 11, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    s.addText([{ text: t, options: { bold: true, fontSize: 14, color: C.text1, breakLine: true } }, { text: d, options: { fontSize: 11, color: C.accent6 } }],
      { x: x + 0.68, y: y + 0.1, w: 2.85, h: 0.68, valign: 'middle', margin: 0, isTextBox: true });
  });
  card(s, 8.35, 1.45, 4.4, 5.35, '07472A');
  s.addText('BACK OFFICE · equipa da plataforma', { x: 8.6, y: 1.62, w: 4, h: 0.32, fontSize: 12, bold: true, charSpacing: 2, color: C.accent2, margin: 0, isTextBox: true });
  bo.forEach(([t, d], i) => {
    const y = 2.08 + i * 0.58;
    s.addShape(pres.shapes.RECTANGLE, { x: 8.62, y: y + 0.12, w: 0.14, h: 0.14, rotate: 45, fill: { color: 'FCD116' }, line: { color: 'FCD116', width: 0 } });
    s.addText([{ text: t + '  ', options: { bold: true, color: C.background1 } }, { text: d, options: { color: 'A6DCBB' } }],
      { x: 8.95, y, w: 3.7, h: 0.4, fontSize: 13, valign: 'middle', margin: 0, isTextBox: true });
  });
}

// ================================================================== 2. front office
sec('Front office');
divider('01', 'Front office', 'O dia-a-dia das empresas e dos consultores: da entrada na plataforma à ficha de conformidade, documentos, relatórios e pagamento.',
  'Primeira parte: o front office, a aplicação usada pelos clientes.');
twoScreens('Acesso', 'Entrada segura e registo da empresa', [
  ['01-login', 'Iniciar sessão', 'E-mail e palavra-passe, recuperação por e-mail'],
  ['02-register', 'Criar conta', 'Registo da empresa com período experimental de 14 dias'],
], 'O acesso é feito com e-mail e palavra-passe. Uma nova empresa regista-se sozinha e começa com 14 dias de experiência gratuita. O ecrã de entrada já mostra a identidade moçambicana da plataforma, com o padrão de capulana.');
screen('Painel', 'Visão imediata do estado de conformidade', '03-dashboard', [
  ['Saudação e estado global', 'Percentagem de conformidade da empresa, actualizada em tempo real.'],
  ['Quatro indicadores', 'Total de itens, em conformidade, prestes a expirar e expirados.'],
  ['Gráfico de estado', 'Distribuição Regular / Atenção / Crítico nas cores da bandeira.'],
  ['Prazos e actividade', 'Próximos vencimentos e últimas alterações da equipa.'],
], 'O painel é o primeiro ecrã depois da entrada. Mostra num relance a percentagem de conformidade, quantos itens estão regulares, quantos expiram nos próximos 30 a 90 dias e quantos já expiraram, com a actividade recente.');
threeScreens('Empresa', 'Dados da empresa, equipa e notificações', [
  ['04-company', 'Dados da empresa', 'NUIT, sede, capital, sector de actividade'],
  ['05-company-users', 'Utilizadores', 'Convites e papéis: administrador, gestor, leitor'],
  ['06-company-notifications', 'Notificações', 'Quem recebe alertas de validade e quando'],
], 'No módulo Empresa o administrador mantém os dados oficiais (que preenchem automaticamente a ficha), convida a equipa com papéis diferentes e escolhe quem recebe os alertas de validade por e-mail.');
screen('Entidades', 'Sede e sucursais, cada uma com a sua ficha', '07-entities', [
  ['Uma entidade por estabelecimento', 'A sede e cada sucursal têm obrigações próprias.'],
  ['Progresso visível', 'Cada entidade mostra o seu nível de conformidade.'],
  ['Limites por plano', 'O número de sucursais depende do plano subscrito.'],
], 'Cada empresa tem uma sede e pode ter sucursais. Cada uma tem a sua ficha de conformidade, porque as obrigações de licenciamento e laborais podem variar por estabelecimento.');
screen('Ficha da entidade', 'O coração da plataforma: todas as obrigações num só ecrã', '08-ficha', [
  ['Organizada por categorias', 'Legal, Societário, Fiscal, Laboral e Licenciamento.'],
  ['Edição directa', 'Clique no descritivo e escreva; grava e sincroniza com a equipa.'],
  ['Validade e anexos', 'Datas de validade e documentos comprovativos por item.'],
  ['Estado automático', 'Regular, Atenção ou Crítico, calculado pelas datas.'],
], 'A ficha da entidade é o ecrã principal. Cada linha é uma obrigação legal com o seu descritivo, a validade, os anexos e o estado. Os dados da empresa preenchem automaticamente vários itens. Tudo o que um utilizador altera aparece em tempo real aos colegas.');
twoScreens('Ficha da entidade', 'Filtros, estados e personalização do checklist', [
  ['09-ficha-scrolled', 'Estados e prazos', 'Itens em Atenção e Crítico destacados por cor'],
  ['10-ficha-edit', 'Editar checklist', 'Adicionar itens próprios e escolher validade e anexo'],
], 'Os filtros encontram rapidamente o que está em risco. No modo de edição, a empresa pode acrescentar obrigações próprias ao modelo base e definir se cada item tem validade ou exige anexo.');
screen('Documentos e OCR', 'Anexar comprovativos e deixar a IA ler o documento', '11-add-document', [
  ['Carregar uma vez, ligar a vários itens', 'Um documento pode comprovar mais de uma obrigação.'],
  ['Leitura automática (OCR)', 'A IA extrai datas e números e propõe o preenchimento.'],
  ['Download protegido', 'Ligações temporárias e código por e-mail para ficheiros sensíveis.'],
], 'Os documentos são carregados para armazenamento privado. Um documento pode ficar ligado a vários itens. Com o OCR, a IA lê a certidão ou licença e propõe a data de validade e o número, que o utilizador confirma.');
twoScreens('Relatórios', 'Relatórios para a administração em PDF e Word', [
  ['12-reports', 'Relatórios', 'Escolher a entidade e o formato'],
  ['13-report-points', 'Pontos do relatório', 'Seleccionar os itens a incluir, com comentário da IA'],
], 'Os relatórios são gerados no servidor em PDF ou Word, com os itens escolhidos e, opcionalmente, uma análise escrita pela IA. Ideais para conselhos de administração, auditores ou due diligence.');
twoScreens('Registos', 'Histórico completo e recuperação de documentos', [
  ['14-audit', 'Registos de actividade', 'Quem fez o quê e quando; exportação CSV'],
  ['15-recycle-bin', 'Documentos apagados', 'Recuperar documentos eliminados por engano'],
], 'Cada alteração fica registada num histórico que não pode ser alterado nem apagado — cada entrada é encadeada à anterior. Documentos apagados vão primeiro para uma reciclagem, de onde podem ser recuperados.');
screen('Assistente de IA', 'Perguntas em linguagem natural sobre a conformidade', '16-ai', [
  ['Conhece a sua empresa', 'Responde com base na ficha, prazos e documentos.'],
  ['Exemplos', '“O que expira este trimestre?” · “Que licenças faltam na sucursal?”'],
  ['Controlado por plano', 'Número de pedidos de IA definido em cada plano.'],
], 'O assistente de IA, baseado no Claude da Anthropic, responde a perguntas sobre a conformidade da empresa usando apenas os dados a que o utilizador tem acesso.');
twoScreens('Subscrições', 'Planos, pagamento e facturação', [
  ['17-billing', 'Subscrição actual', 'Plano, limites usados e facturas'],
  ['18-billing-checkout', 'Escolher plano', 'Cartão (Stripe), SISLOG ou transferência bancária'],
], 'A empresa vê o seu plano e o consumo dos limites. Pode mudar de plano e pagar por cartão, pela SISLOG ou por transferência bancária com factura. Os vouchers de desconto aplicam-se no momento do pagamento.');
screen('Perfil', 'Cada utilizador gere os seus dados', '19-profile', [
  ['Dados pessoais', 'Nome, e-mail e telefone moçambicano (9 dígitos).'],
  ['Segurança', 'Alteração da palavra-passe com confirmação.'],
  ['Idioma', 'Português ou inglês a qualquer momento.'],
], 'No perfil, cada utilizador actualiza os seus dados e a palavra-passe. A mudança de e-mail é confirmada por mensagem.');

// ================================================================== 3. mobile
sec('Telemóvel');
divider('02', 'No telemóvel', 'A mesma plataforma, desenhada para o ecrã pequeno: menu lateral, ficha em cartões e botão de documento sempre à mão.',
  'Segunda parte: a experiência no telemóvel. Não é uma aplicação separada — é a mesma plataforma, que se adapta ao ecrã.');
phones('Telemóvel', 'Entrar, consultar e navegar', [
  ['01-login', 'Entrada'], ['02-dashboard', 'Painel'], ['03-menu', 'Menu'], ['04-entities', 'Entidades'], ['05-ficha', 'Ficha'],
], 'No telemóvel o painel mostra os indicadores em grelha, o menu abre como gaveta lateral e as entidades aparecem em lista.');
phones('Telemóvel', 'A ficha em cartões, pensada para o polegar', [
  ['06-ficha-cards', 'Cartões por item'], ['07-add-document', 'Anexar documento'], ['09-ai', 'Assistente de IA'], ['10-billing', 'Subscrição'], ['11-audit', 'Registos'],
], 'No telemóvel cada obrigação é um cartão, com uma borda colorida que indica o estado. O botão verde flutuante adiciona documentos — pode fotografar a certidão directamente. O assistente de IA, a subscrição e os registos estão todos disponíveis.');

// ================================================================== 4. back office
sec('Back office');
divider('03', 'Back office', 'A consola da equipa da plataforma: clientes, modelos de checklist, planos, pagamentos e auditoria global.',
  'Terceira parte: o back office, acessível apenas à equipa interna, com papéis próprios.');
twoScreens('Back office', 'Organizações e equipa da plataforma', [
  ['20-admin-organizations', 'Organizações', 'Todas as empresas clientes, estado e plano'],
  ['26-admin-staff', 'Equipa da plataforma', 'Papéis internos: super admin, operador, suporte'],
], 'A equipa vê todas as organizações clientes. O acesso de um operador aos dados de um cliente exige consentimento e fica registado.');
twoScreens('Back office', 'Modelos de checklist com versões', [
  ['21-admin-templates', 'Modelos', 'O modelo “Obrigações Gerais” e outros por sector'],
  ['22-admin-template-editor', 'Editor de versões', 'Rascunho, publicação e histórico de versões'],
], 'Os modelos de checklist têm versões. A equipa edita um rascunho e, ao publicar, as fichas dos clientes recebem os novos itens sem perder o que já preencheram.');
threeScreens('Back office', 'Planos, vouchers e pagamentos', [
  ['23-admin-plans', 'Planos', 'Limites e preços por período'],
  ['24-admin-vouchers', 'Vouchers', 'Descontos com validade e limite de uso'],
  ['25-admin-payments', 'Pagamentos', 'Confirmação de transferências e histórico'],
], 'Os planos e os preços são configuráveis sem programação. Os vouchers dão descontos controlados. Os pagamentos por transferência são confirmados aqui, o que activa a subscrição.');
threeScreens('Back office', 'Configuração, comunicações e auditoria global', [
  ['27-admin-settings', 'Definições', 'Parâmetros da plataforma e dados bancários'],
  ['28-admin-emails', 'E-mails', 'Mensagens enviadas e estado de entrega'],
  ['29-admin-audit', 'Registos da plataforma', 'Auditoria de todas as organizações'],
], 'As definições globais, o registo de e-mails enviados e a auditoria de toda a plataforma ficam no back office.');

// ================================================================== 5. tecnologia e segurança
sec('Tecnologia e segurança');
divider('04', 'Tecnologia e segurança', 'Arquitectura moderna, dados protegidos por regras na base de dados, histórico inalterável e cópias de segurança.',
  'Quarta parte: como a plataforma está construída e como protege os dados.');
{
  const s = content('Arquitectura', 'Uma arquitectura simples, segura e escalável',
    'O frontend é uma aplicação Angular servida pela Netlify. Toda a lógica sensível está no Supabase: autenticação, base de dados Postgres com regras de acesso por linha, armazenamento privado, funções no servidor e tarefas agendadas. As integrações externas ligam-se apenas pelo servidor.');
  const col = (x, w, title, fill, fg, items, sub) => {
    card(s, x, 1.6, w, 4.95, fill, fill === 'FFFFFF' ? 'E9DFCC' : fill);
    s.addText(title, { x: x + 0.25, y: 1.8, w: w - 0.5, h: 0.45, fontSize: 18, bold: true, color: fg, margin: 0, isTextBox: true });
    s.addText(sub, { x: x + 0.25, y: 2.25, w: w - 0.5, h: 0.35, fontSize: 11.5, color: fill === '07472A' ? 'A6DCBB' : C.accent6, margin: 0, isTextBox: true });
    items.forEach((t, i) => {
      card(s, x + 0.25, 2.8 + i * 0.72, w - 0.5, 0.58, fill === '07472A' ? '095E36' : 'F4EEE2');
      s.addText(t, { x: x + 0.4, y: 2.8 + i * 0.72, w: w - 0.8, h: 0.58, fontSize: 13, color: fill === '07472A' ? C.background1 : C.text1, valign: 'middle', margin: 0, isTextBox: true });
    });
  };
  col(0.6, 3.7, 'Aplicação web', 'FFFFFF', C.accent1, ['Angular 22 · sinais', 'PT / EN em tempo real', 'Responsivo e acessível (WCAG AA)', 'Netlify com cabeçalhos de segurança', 'Testes E2E com Playwright'], 'Computador, tablet e telemóvel');
  col(4.82, 3.7, 'Supabase', '07472A', C.accent2, ['Autenticação e papéis', 'Postgres com RLS por linha', 'Armazenamento privado', 'Edge Functions (servidor)', 'Tarefas agendadas (pg_cron)'], 'Base de dados e servidor');
  col(9.04, 3.7, 'Integrações', 'FFFFFF', C.accent3, ['Claude (IA e OCR)', 'Stripe (cartão)', 'SISLOG (pagamentos locais)', 'Officegest (facturação)', 'Resend (e-mails)'], 'Apenas a partir do servidor');
  for (const x of [4.38, 8.6]) s.addText('→', { x, y: 3.65, w: 0.4, h: 0.5, fontSize: 26, bold: true, color: C.accent1, align: 'center', margin: 0, isTextBox: true });
}
{
  const s = content('Segurança', 'Os dados de cada empresa ficam só para essa empresa', 'As regras de acesso estão na própria base de dados, por isso valem para qualquer canal. O histórico é encadeado, como um livro de registos selado. Os ficheiros são privados e só se abrem com ligações temporárias.');
  const rows = [
    ['Isolamento por empresa', 'Regras de acesso por linha (RLS) em todas as tabelas, testadas por 67 testes automáticos.', '0D7744'],
    ['Papéis e consentimento', 'Administrador, gestor e leitor; o acesso do suporte exige consentimento do cliente.', 'FCD116'],
    ['Histórico inalterável', 'Registo de actividade só de acrescentar, com cada entrada encadeada por hash.', 'C0102B'],
    ['Ficheiros protegidos', 'Armazenamento privado, ligações temporárias e código de download por e-mail.', '141414'],
    ['Cópias de segurança', 'Cópia nocturna cifrada da base de dados e dos ficheiros, com plano de recuperação.', '16955A'],
  ];
  rows.forEach(([t, d, c], i) => {
    const y = 1.6 + i * 1.0;
    card(s, 0.6, y, 12.15, 0.86, 'FFFFFF', 'E9DFCC');
    s.addShape(pres.shapes.RECTANGLE, { x: 0.95, y: y + 0.27, w: 0.32, h: 0.32, rotate: 45, fill: { color: c }, line: { color: c, width: 0 } });
    s.addText(t, { x: 1.6, y, w: 3.4, h: 0.86, fontSize: 16, bold: true, color: C.text1, valign: 'middle', margin: 0, isTextBox: true });
    s.addText(d, { x: 5.0, y, w: 7.5, h: 0.86, fontSize: 13.5, color: C.accent6, valign: 'middle', margin: 0, isTextBox: true });
  });
}
{
  const s = content('Avaliação', 'As 10 áreas de avaliação, cobertas', 'Resumo do estado nas dez áreas de avaliação definidas no início do projecto. A plataforma está em produção; os pontos em aberto dependem sobretudo de credenciais e documentação de terceiros.');
  const H = { bold: true, color: 'FFFFFF', fill: { color: '07472A' }, fontSize: 12 };
  const rows = [
    ['1', 'Segurança e integridade dos dados', 'RLS em todas as tabelas, 67 testes, URLs assinados, CSP/HSTS'],
    ['2', 'Alojamento', 'Supabase (UE) + Netlify, projectos separados de dev e produção'],
    ['3', 'Front / back office e sincronização', 'Todos os ecrãs + back office, sincronização em tempo real'],
    ['4', 'UI / UX', 'PT/EN, responsivo, identidade moçambicana, WCAG 2.2 AA'],
    ['5', 'Sites', 'Aplicação publicada; domínio próprio a configurar'],
    ['6', 'Validação dos fluxos de negócio', 'Regras na base de dados, 82 testes automáticos'],
    ['7', 'Desempenho e estabilidade', 'Índices, paginação, rotas carregadas a pedido'],
    ['8', 'Subscrições e pagamentos', 'Planos, vouchers, transferência e Stripe; SISLOG a ligar'],
    ['9', 'Registo de actividade', 'Histórico encadeado, exportação CSV, visão global'],
    ['10', 'Recuperação e cópias de segurança', 'Reciclagem, cópia nocturna cifrada, plano de recuperação'],
  ];
  s.addTable([[{ text: '#', options: H }, { text: 'Área', options: H }, { text: 'Como está coberta', options: H }],
    ...rows.map((r, i) => r.map((t, j) => ({ text: t, options: { fontSize: 11.5, color: '141414', bold: j === 1, fill: { color: i % 2 ? 'F4EEE2' : 'FFFFFF' } } })))],
  { x: 0.6, y: 1.5, w: 12.15, colW: [0.55, 4.0, 7.6], rowH: 0.43, border: { type: 'solid', color: 'E9DFCC', pt: 0.75 }, margin: [0.04, 0.1, 0.04, 0.1], valign: 'middle' });
}

// ================================================================== 6. planos e próximos passos
sec('Planos e próximos passos');
{
  const s = content('Planos', 'Planos para cada dimensão de empresa (MZN)', 'Quatro planos. O experimental é gratuito por 14 dias. Os preços semestrais e anuais têm desconto. Utilizadores e sucursais extra podem ser comprados à parte. Os valores são configuráveis no back office.');
  const plans = [
    ['Experimental', 'Grátis', '14 dias', ['1 utilizador', 'Só a sede', '200 MB', '10 leituras OCR', '10 pedidos de IA'], 'FFFFFF', 'F4EEE2'],
    ['Essencial', '2 000', 'por mês · 19 200 / ano', ['3 utilizadores', 'Só a sede', '2 GB', '20 leituras OCR', 'Sem assistente de IA'], 'FFFFFF', 'F4EEE2'],
    ['Profissional', '3 500', 'por mês · 33 600 / ano', ['5 utilizadores', '3 sucursais', '10 GB', 'OCR ilimitado', '100 pedidos de IA'], '07472A', '095E36'],
    ['Empresarial', '8 500', 'por mês · 81 600 / ano', ['10 utilizadores', 'Sucursais ilimitadas', '50 GB', 'OCR ilimitado', 'IA ilimitada'], 'FFFFFF', 'F4EEE2'],
  ];
  plans.forEach(([name, price, per, feats, fill], i) => {
    const x = 0.6 + i * 3.08, dark = fill === '07472A';
    card(s, x, 1.55, 2.9, 5.1, fill, dark ? fill : 'E9DFCC');
    if (dark) {
      card(s, x + 0.85, 1.38, 1.2, 0.34, 'FCD116');
      s.addText('POPULAR', { x: x + 0.85, y: 1.38, w: 1.2, h: 0.34, fontSize: 10, bold: true, charSpacing: 2, color: C.text1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    }
    s.addText(name, { x: x + 0.25, y: 1.85, w: 2.4, h: 0.4, fontSize: 18, bold: true, color: dark ? C.accent2 : C.accent1, margin: 0, isTextBox: true });
    s.addText([{ text: price, options: { fontSize: 36, bold: true } }, { text: price === 'Grátis' ? '' : ' MZN', options: { fontSize: 14 } }],
      { x: x + 0.25, y: 2.3, w: 2.5, h: 0.75, color: dark ? C.background1 : C.text1, valign: 'bottom', margin: 0, isTextBox: true });
    s.addText(per, { x: x + 0.25, y: 3.08, w: 2.5, h: 0.3, fontSize: 11.5, color: dark ? 'A6DCBB' : C.accent6, margin: 0, isTextBox: true });
    s.addText(feats.map((f, j) => ({ text: f, options: { bullet: true, breakLine: j < feats.length - 1 } })),
      { x: x + 0.25, y: 3.6, w: 2.5, h: 2.8, fontSize: 13.5, color: dark ? C.background1 : C.text1, paraSpaceAfter: 8, valign: 'top', margin: 0, isTextBox: true });
  });
}
{
  const s = content('Próximos passos', 'O que falta para o lançamento comercial', 'A plataforma está em produção. Faltam sobretudo passos de configuração e de terceiros: domínio, chaves de pagamento, especificações da SISLOG e Officegest, e o primeiro exercício de recuperação de dados.');
  const steps = [
    ['1', 'Configurar produção', 'Chaves de e-mail, IA e Stripe; domínio próprio e site público.'],
    ['2', 'Ligar SISLOG e Officegest', 'Assim que recebermos a documentação das APIs.'],
    ['3', 'Piloto com clientes', 'Primeiras empresas e consultores, com acompanhamento.'],
    ['4', 'Plano Pro e recuperação', 'Recuperação a qualquer momento (PITR) e exercício de restauro.'],
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
  const s = pres.addSlide({ masterName: 'CAPA', sectionTitle: section });
  s.addText('Obrigado', { placeholder: 'title' });
  s.addText('Checklist Legal — conformidade legal feita em Moçambique, para empresas moçambicanas.', { placeholder: 'body' });
  s.addText('Demonstração ao vivo e vídeo de apresentação disponíveis', { placeholder: 'meta' });
  s.addNotes('Obrigado. Seguimos para a demonstração ao vivo ou para o vídeo de apresentação, e depois perguntas.');
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('written', OUT);
})();
