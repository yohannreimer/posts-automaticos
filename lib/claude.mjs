import Anthropic from '@anthropic-ai/sdk';
import { isValidStyle } from '../templates/registry.mjs';

// Modelo usado na geração dos carrosséis. Alternativa mais barata: 'claude-sonnet-5'.
const MODEL = 'claude-opus-4-8';

const SYSTEM_PROMPT = `Você transforma um texto bruto (transcrição de vídeo, resumo de aula, anotações) em um
roteiro de carrossel para Instagram no estilo "creator direto ao ponto": frases curtas,
contraste, uma virada de raciocínio, tom de conversa.

## Formatos de conteúdo
Analise o texto e escolha O FORMATO que melhor se encaixa (informe em "content_format"):
- "passo-a-passo": tutorial/processo → um passo por slide, com badge numérico ("1", "2"...).
- "licoes": lições/aprendizados ("X coisas que aprendi...") → uma lição por slide, badge numérico.
- "mito-vs-fato": desmontar crenças → slides alternando MITO (badge "MITO") e FATO (badge "FATO").
- "hot-take": opinião forte → capa com a tese polêmica, slides com os argumentos.
- "cheat-sheet": referência rápida e densa → cada slide autocontido com header curto (eyebrow).
- "stats": dados/números → um número grande por slide (no badge) com contexto no texto.
- "narrativa": história/virada pessoal → progressão livre de tensão até o insight.

## Estilo visual sugerido
Sugira também um estilo visual em "suggested_style":
- "grid": tom direto/provocador, creator bold.
- "editorial": conteúdo sério, resumo de aula formal, tom premium.
- "scrapbook": tom pessoal, anotações de caderno, aprendizados íntimos.
- "pano": narrativa com progressão forte, storytelling.

## Estrutura dos slides
1. Capa (role "cover"): headline forte de poucas palavras; pode ter 1-2 palavras em "highlight".
2. Slides de conteúdo (role "content"): 1 a 3 frases curtas cada — nunca parágrafo longo.
   Alterne "variant" entre "light" e "dark" para dar ritmo (exceto se ficar estranho no formato).
3. Fechamento (role "closing"): frase de impacto final ou call-to-action curto.

## Regras
- Nunca invente fatos que não estejam no texto original.
- Escreva em português, a não ser que o texto original esteja em outro idioma.
- Frases curtas. Corte enrolação.
- "highlight" deve ser um trecho EXATO do texto do slide.
- "badge" curto: número ("1"), rótulo ("MITO", "FATO", "PASSO 3") ou estatística ("87%").
- Use "decoration": "arrow" no máximo em 1 slide, no ponto de virada.
- "eyebrow" e "signature" são opcionais.

## Legenda (caption)
Gere também a legenda do post em "caption": 2-4 frases que complementam (não repetem) o
carrossel, terminando com um call-to-action de engajamento (comentar/salvar/compartilhar)
e 5-8 hashtags relevantes em português na última linha.`;

function buildUserPrompt({ rawText, slideCount, author, topic }) {
  return [
    topic ? `Tema/ângulo pedido pelo usuário: ${topic}` : null,
    author ? `Assinatura a usar quando fizer sentido: ${author}` : null,
    `Gere aproximadamente ${slideCount} slides no total (contando capa e fechamento).`,
    `Texto de origem (transcrição/resumo/notas):\n"""\n${rawText}\n"""`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

const SLIDE_TOOL = {
  name: 'emit_carousel',
  description: 'Emite o roteiro final do carrossel como lista estruturada de slides.',
  input_schema: {
    type: 'object',
    properties: {
      content_format: {
        type: 'string',
        enum: ['passo-a-passo', 'licoes', 'mito-vs-fato', 'hot-take', 'cheat-sheet', 'stats', 'narrativa'],
      },
      suggested_style: {
        type: 'string',
        enum: ['grid', 'editorial', 'scrapbook', 'pano'],
      },
      caption: {
        type: 'string',
        description: 'Legenda do post para o Instagram, com CTA e hashtags.',
      },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['cover', 'content', 'closing'] },
            variant: { type: 'string', enum: ['light', 'dark'] },
            text: { type: 'string', description: 'Texto principal do slide.' },
            badge: { type: 'string', description: 'Rótulo curto: número, "MITO", "87%"... (opcional)' },
            eyebrow: { type: 'string', description: 'Texto pequeno acima do título (opcional).' },
            signature: { type: 'string', description: 'Assinatura, ex: "por Fulano" (opcional).' },
            highlight: { type: 'string', description: 'Trecho exato do texto a destacar (opcional).' },
            decoration: { type: 'string', enum: ['none', 'arrow'] },
          },
          required: ['role', 'variant', 'text'],
        },
      },
    },
    required: ['content_format', 'suggested_style', 'caption', 'slides'],
  },
};

// Divide um texto-fonte em N ângulos distintos, cada um virando um post.
export async function generateAngles({ rawText, count = 5 }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada.');
  }
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      'Você planeja conteúdo para Instagram. Dado um texto-fonte (aula, transcrição, notas), ' +
      'divida-o em ângulos DISTINTOS para uma série de carrosséis — cada ângulo cobre uma ideia ' +
      'diferente do texto, sem repetir os outros. Nunca invente fatos fora do texto. ' +
      'Ordene do mais forte/chamativo para o mais nichado.',
    tools: [
      {
        name: 'emit_angles',
        description: 'Emite os ângulos planejados para a série de posts.',
        input_schema: {
          type: 'object',
          properties: {
            angles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Título curto do ângulo.' },
                  focus: {
                    type: 'string',
                    description: 'Instrução de foco: qual parte do texto usar e qual a tese do post.',
                  },
                },
                required: ['title', 'focus'],
              },
            },
          },
          required: ['angles'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_angles' },
    messages: [
      {
        role: 'user',
        content: `Planeje exatamente ${count} ângulos.\n\nTexto-fonte:\n"""\n${rawText}\n"""`,
      },
    ],
  });
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  const angles = (toolUse?.input.angles || []).slice(0, count);
  if (!angles.length) throw new Error('A IA não retornou ângulos. Tente novamente.');
  return angles;
}

export async function generateSlides({ rawText, slideCount = 8, author = '', topic = '' }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY não configurada. Copie .env.example para .env e cole sua chave.'
    );
  }
  if (!rawText || !rawText.trim()) {
    throw new Error('Texto de origem vazio.');
  }

  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [SLIDE_TOOL],
    tool_choice: { type: 'tool', name: 'emit_carousel' },
    messages: [
      { role: 'user', content: buildUserPrompt({ rawText, slideCount, author, topic }) },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('A IA não retornou o formato esperado. Tente novamente.');
  }

  const { content_format, suggested_style, caption, slides: rawSlides } = toolUse.input;

  const slides = (rawSlides || []).map((s, i) => ({
    id: `s${i + 1}`,
    role: s.role || 'content',
    variant: s.variant === 'dark' ? 'dark' : 'light',
    text: s.text || '',
    badge: s.badge || '',
    eyebrow: s.eyebrow || '',
    signature: s.signature || '',
    highlight: s.highlight || '',
    decoration: s.decoration && s.decoration !== 'none' ? s.decoration : '',
  }));

  return {
    style: isValidStyle(suggested_style) ? suggested_style : 'grid',
    contentFormat: content_format || '',
    caption: caption || '',
    slides,
  };
}
