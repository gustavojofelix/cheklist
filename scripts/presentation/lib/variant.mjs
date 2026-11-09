// Which video the narration / mux / mp3 scripts work on: VIDEO=plataforma (default) or VIDEO=legislacao.
const VARIANTS = {
  plataforma: { scenes: '../scenes.mjs', narr: 'docs/presentation/.narration', video: 'Checklist-Legal-Video', mp3: 'narracao', mp3Name: 'Checklist-Legal-Narracao-ptBR' },
  legislacao: { scenes: '../scenes-legislacao.mjs', narr: 'docs/presentation/.narration-legislacao', video: 'Checklist-Legal-Acasalamento', mp3: 'narracao-acasalamento', mp3Name: 'Checklist-Legal-Acasalamento-Narracao-ptBR' },
};
export const VIDEO = process.env.VIDEO ?? 'plataforma';
export const V = VARIANTS[VIDEO];
if (!V) throw new Error(`unknown VIDEO=${VIDEO}; use ${Object.keys(VARIANTS).join(', ')}`);
export const { SCENES, VOICE } = await import(V.scenes);
