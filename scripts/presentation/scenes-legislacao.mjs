// Narration (Brazilian Portuguese voice-over) and captions for the "acasalamento de documentos" video.
// Example: LACI047 — Decreto n.º 38.088 (Código das Execuções Fiscais) and the three diplomas that amend it.
export const VOICE = 'pt-BR-FranciscaNeural';

export const SCENES = [
  { id: 'intro', say: 'Acasalamento de documentos: como o Checklist Legal liga um diploma original às leis que o alteram, até chegar ao texto revisto.' },
  { id: 'problem', say: 'Um diploma raramente fica como foi publicado. O Código das Execuções Fiscais nasceu em 1950 e foi alterado três vezes: em 1951, em 1966 e em 2013. Para saber o que está em vigor, é preciso juntar todas essas peças.' },
  { id: 'bo', cap: '<b>Back office</b> · biblioteca de legislação', say: 'No back office, a equipe da plataforma mantém a biblioteca de legislação.' },
  { id: 'new-act', cap: '<b>Novo diploma</b> · Decreto n.º 38.088', say: 'Criamos o diploma: o Código das Execuções Fiscais, Decreto número 38.088, de 1950, com a referência interna LACI 047.' },
  { id: 'original', cap: '<b>1 · Original</b> · Decreto n.º 38.088, de 1950', say: 'Primeiro, carregamos o original: o Decreto 38.088, de dezembro de 1950.' },
  { id: 'alt-2013', cap: '<b>Alteração</b> · Decreto-Lei n.º 1/2013', say: 'Depois, as alterações, na ordem em que chegaram. A primeira é o Decreto-Lei 1 de 2013, que aprovou o regime da insolvência e revogou os artigos 147 e 148 do Código.' },
  { id: 'alt-1966', cap: '<b>Alteração</b> · Decreto n.º 46.849, de 1966', say: 'A segunda é o Decreto 46.849, de 1966, que revoga o parágrafo primeiro do artigo 269.' },
  { id: 'alt-1951', cap: '<b>Alteração</b> · Decreto n.º 38.295, de 1951', say: 'E a terceira, o Decreto 38.295, de 1951, que substitui o artigo primeiro.' },
  { id: 'order', cap: '<b>Ordem cronológica</b> · cada alteração ligada ao original', say: 'Repare: carregamos as alterações fora de ordem, mas a plataforma ordena tudo pela data de publicação. Cada alteração fica ligada ao original, e a numeração acompanha a cronologia.' },
  { id: 'guard', cap: '<b>Validação</b> · nada antes do original', say: 'E a plataforma recusa uma alteração com data anterior ao original.' },
  { id: 'revised', cap: '<b>Versão revista</b> · texto consolidado', say: 'Por fim, a versão revista: o texto consolidado do Código, com as três alterações já incorporadas.' },
  { id: 'pairing', cap: '<b>Acasalamento</b> · original + 3 alterações → versão revista', say: 'Este é o acasalamento completo: o original, mais três alterações, resultam na versão revista. Tudo num só lugar, com a origem de cada mudança.' },
  { id: 'ch-client', say: 'E do lado do cliente?' },
  { id: 'client-list', cap: '<b>Legislação</b> · no menu do cliente', say: 'Os clientes encontram a mesma biblioteca no menu Legislação.' },
  { id: 'client-detail', cap: '<b>Só leitura</b> · o que mudou, quando e por qual diploma', say: 'Ao abrir o diploma, veem exatamente o que mudou, quando e por qual lei. E cada documento abre em PDF, incluindo o texto revisto.' },
  { id: 'phone', say: 'No celular, a cadeia se adapta à tela: original, alterações e versão revista, de cima para baixo.' },
  { id: 'outro', say: 'Checklist Legal: o original, as alterações e o texto em vigor, lado a lado.' },
];
