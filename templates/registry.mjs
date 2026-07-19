// Estilos visuais do carrossel. O estilo é global (um por carrossel);
// cada slide tem um "role" (cover/content/closing) e uma "variant" (light/dark).
// Para adicionar um estilo novo: registre aqui e implemente o renderer
// correspondente em render.mjs (STYLE_RENDERERS).

export const STYLES = [
  {
    id: 'grid',
    label: 'Grid bold (padrão)',
    description: 'Fundo quadriculado, tipografia bold, destaque em vermelho.',
  },
  {
    id: 'editorial',
    label: 'Editorial / revista',
    description: 'Serifa elegante, numeração de página, ar premium.',
  },
  {
    id: 'scrapbook',
    label: 'Scrapbook / caderno',
    description: 'Papel, fita adesiva, fonte manuscrita, marca-texto.',
  },
  {
    id: 'pano',
    label: 'Panorâmico contínuo',
    description: 'Fundo único que atravessa todos os slides no swipe.',
  },
];

export const ROLES = [
  { id: 'cover', label: 'Capa' },
  { id: 'content', label: 'Conteúdo' },
  { id: 'closing', label: 'Fechamento' },
];

export const VARIANTS = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
];

export function isValidStyle(id) {
  return STYLES.some((s) => s.id === id);
}

// Migra slides do formato antigo (template: 'cover'|'content-light'|...)
// para o novo (role + variant).
export function migrateLegacySlide(slide) {
  if (slide.role) return slide;
  const map = {
    cover: { role: 'cover', variant: 'light' },
    'content-light': { role: 'content', variant: 'light' },
    'content-dark': { role: 'content', variant: 'dark' },
    closing: { role: 'closing', variant: 'dark' },
  };
  const { template, ...rest } = slide;
  return { ...rest, badge: slide.badge || '', ...(map[template] || map['content-light']) };
}
