import Anthropic from '@anthropic-ai/sdk';
import { isValidStyle } from '../templates/registry.mjs';

// Modelo da IA. Configurável via CLAUDE_MODEL no .env:
//   claude-opus-4-8  → mais capaz ($5/$25 por MTok)
//   claude-sonnet-5  → ~metade do custo, mais rápido ($3/$15; promo $2/$10 até ago/2026)
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';

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

function buildUserPrompt({ rawText, slideCount, author, topic, learnings }) {
  return [
    topic ? `Tema/ângulo pedido pelo usuário: ${topic}` : null,
    author ? `Assinatura a usar quando fizer sentido: ${author}` : null,
    learnings || null,
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
export async function generateAngles({ rawText, count = 5, learnings = '' }) {
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
        content: `${learnings ? `${learnings}\n\n` : ''}Planeje exatamente ${count} ângulos.\n\nTexto-fonte:\n"""\n${rawText}\n"""`,
      },
    ],
  });
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  const angles = (toolUse?.input.angles || []).slice(0, count);
  if (!angles.length) throw new Error('A IA não retornou ângulos. Tente novamente.');
  return angles;
}

// Analisa a transcrição de um Reel: gancho de abertura, palavras-chave a
// destacar em dourado (poucas, espalhadas — só os conceitos centrais do vídeo)
// e a legenda do post.
export async function analyzeReel({ blocks, learnings = '' }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada.');
  }
  const numbered = blocks
    .map((block, bi) => `${bi}: ` + block.map((w, wi) => `${w.t}(${wi})`).join(' '))
    .join('\n');

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      'Você prepara Reels de criadores de conteúdo. Receberá a transcrição em blocos ' +
      'numerados (cada palavra com seu índice). Gere:\n' +
      '1. "hook": título-gancho de 4 a 8 palavras para os primeiros segundos do vídeo — ' +
      'deve fazer quem vê SEM SOM entender o assunto e querer ficar. Sem clickbait vazio; ' +
      'use o conteúdo real do vídeo.\n' +
      '2. "highlights": as palavras-CONCEITO do vídeo para destacar em dourado na legenda. ' +
      'POUCAS: entre 4 e 8 no vídeo todo, espalhadas, no máximo 1 por bloco e pulando a ' +
      'maioria dos blocos. Escolha substantivos/verbos de significado (nunca artigos, ' +
      'conectivos ou palavras vazias).\n' +
      '3. "caption": legenda do post no Instagram — 2 a 4 frases que complementam o vídeo, ' +
      'CTA de engajamento e 5-8 hashtags em português na última linha.',
    tools: [
      {
        name: 'emit_reel_plan',
        description: 'Emite o plano do Reel.',
        input_schema: {
          type: 'object',
          properties: {
            hook: { type: 'string' },
            caption: { type: 'string' },
            highlights: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  block: { type: 'integer', description: 'índice do bloco' },
                  word: { type: 'integer', description: 'índice da palavra no bloco' },
                },
                required: ['block', 'word'],
              },
            },
          },
          required: ['hook', 'caption', 'highlights'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_reel_plan' },
    messages: [{ role: 'user', content: `${learnings ? learnings + '\n\n' : ''}Blocos da transcrição:\n${numbered}` }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error('A IA não retornou o plano do Reel.');
  const { hook = '', caption = '', highlights = [] } = toolUse.input;
  // valida índices
  const valid = highlights.filter(
    (h) => blocks[h.block] && blocks[h.block][h.word] !== undefined
  );
  return { hook, caption, highlights: valid };
}

// Relatório de desempenho em português: o que funcionou, hipóteses e experimentos.
export async function generateInsightsReport({ summary, overview, period = null }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada.');
  const client = new Anthropic();

  const lines = summary.slice(0, 40).map((r) => {
    const m = r.metrics, t = r.rates;
    return `[${r.postedAt?.slice(0, 10)}|${r.productType === 'REELS' ? 'reel' : 'feed'}|${r.theme || '?'}|hook:${r.contentFormat || '?'}] ` +
      `views=${m.views ?? '-'} reach=${m.reach ?? '-'} likes=${m.likes ?? '-'} saves=${m.saves ?? '-'} shares=${m.shares ?? '-'} ` +
      `save%=${t.saveRate ?? '-'} eng%=${t.engagementRate ?? '-'} score=${r.score ?? '-'} confiança=${r.scoreConfidenceLabel || '-'} :: "${(r.hook || r.caption || '').slice(0, 80)}"`;
  }).join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system:
      'Você é analista de conteúdo de Instagram. Escreva um relatório curto em português brasileiro, ' +
      'em markdown, direto e prático. Comece direto em ## Visão geral, sem título H1. Estrutura: ## Visão geral (2-3 frases honestas sobre o momento da conta), ' +
      '## O que funcionou (padrões reais dos dados, com exemplos), ## O que não funcionou, ' +
      '## 3 experimentos para a próxima semana (específicos e testáveis). ' +
      'Se a amostra for pequena, diga isso com franqueza e foque nos experimentos. Não invente números.',
    messages: [{
      role: 'user',
      content: `${period ? `Período analisado: ${period.periodStart} até ${period.periodEnd}.\n` : ''}` +
        `Resumo e comparação: ${JSON.stringify(overview)}\n\nPosts do período:\n${lines || '(nenhum post no período)'}`,
    }],
  });
  return response.content.find((b) => b.type === 'text')?.text || '';
}

// Minera comentários: clusteriza perguntas/dores em ideias de conteúdo.
export async function mineComments({ comments }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada.');
  const client = new Anthropic();
  const list = comments.slice(0, 150).map((c) => `- [${c.likes}❤ em "${c.post}"] ${c.text.slice(0, 200)}`).join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system:
      'Você analisa comentários de Instagram de um criador e extrai IDEIAS DE CONTEÚDO a partir das ' +
      'perguntas, dores e pedidos recorrentes da audiência. Ignore elogios vazios e spam. ' +
      'Cada ideia deve citar a evidência (o que os comentários pedem).',
    tools: [{
      name: 'emit_ideas',
      description: 'Emite as ideias de conteúdo mineradas.',
      input_schema: {
        type: 'object',
        properties: {
          ideas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                idea: { type: 'string', description: 'Ângulo do post, em 1 frase.' },
                evidence: { type: 'string', description: 'O que nos comentários sustenta isso.' },
                format: { type: 'string', enum: ['carrossel', 'reel'] },
              },
              required: ['idea', 'evidence', 'format'],
            },
          },
        },
        required: ['ideas'],
      },
    }],
    tool_choice: { type: 'tool', name: 'emit_ideas' },
    messages: [{ role: 'user', content: `Comentários:\n${list}` }],
  });
  return response.content.find((b) => b.type === 'tool_use')?.input.ideas || [];
}

// Classifica posts antigos (publicados fora do app) a partir da legenda:
// tema, tipo de hook, CTA e palavras-chave. Em lote pra economizar chamadas.
export async function classifyPosts(posts) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada.');
  const client = new Anthropic();
  const numbered = posts.map((p, i) => `${i}: """${(p.caption || '').slice(0, 500)}"""`).join('\n\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system:
      'Você classifica posts de Instagram a partir das legendas. Para cada post numerado, ' +
      'identifique: theme (tema em 2-4 palavras), hook_type (curiosidade|dor|promessa|confronto|lista|historia|dado), ' +
      'cta (o call-to-action usado, ex: "salvar", "comentar X", "nenhum") e keywords (3-5 palavras-chave).',
    tools: [{
      name: 'emit_classification',
      description: 'Emite a classificação de todos os posts.',
      input_schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                theme: { type: 'string' },
                hook_type: { type: 'string' },
                cta: { type: 'string' },
                keywords: { type: 'array', items: { type: 'string' } },
              },
              required: ['index', 'theme', 'hook_type', 'cta'],
            },
          },
        },
        required: ['items'],
      },
    }],
    tool_choice: { type: 'tool', name: 'emit_classification' },
    messages: [{ role: 'user', content: `Posts:\n\n${numbered}` }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  return toolUse?.input.items || [];
}

export async function generateSlides({ rawText, slideCount = 8, author = '', topic = '', learnings = '' }) {
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
      { role: 'user', content: buildUserPrompt({ rawText, slideCount, author, topic, learnings }) },
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
