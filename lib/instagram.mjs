// Publicação via Instagram Graph API (conta Professional obrigatória).
// Fluxo carrossel: cria um container por imagem → container CAROUSEL →
// aguarda processamento → publica. Ver SETUP-INSTAGRAM.md para obter
// IG_USER_ID e IG_ACCESS_TOKEN.

const BASE = process.env.IG_GRAPH_BASE || 'https://graph.instagram.com/v21.0';

export function instagramEnabled() {
  return Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID);
}

async function ig(path, params = {}, method = 'POST') {
  const url = new URL(`${BASE}/${path}`);
  const allParams = { ...params, access_token: process.env.IG_ACCESS_TOKEN };
  let options = { method };
  if (method === 'GET') {
    for (const [k, v] of Object.entries(allParams)) url.searchParams.set(k, v);
  } else {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(allParams)) form.set(k, v);
    options.body = form;
  }
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}`;
    throw new Error(`Instagram API: ${msg}`);
  }
  return data;
}

async function waitForContainer(containerId, { timeoutMs = 90000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status_code } = await ig(containerId, { fields: 'status_code' }, 'GET');
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR') throw new Error('O Instagram rejeitou a mídia (container ERROR).');
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error('Tempo esgotado aguardando o Instagram processar as imagens.');
}

// imageUrls: URLs públicas (o Instagram baixa). Retorna { id, permalink }.
export async function publishToInstagram({ imageUrls, caption = '' }) {
  if (!instagramEnabled()) {
    throw new Error(
      'IG_ACCESS_TOKEN/IG_USER_ID não configurados no .env. Siga o SETUP-INSTAGRAM.md.'
    );
  }
  if (!imageUrls?.length) throw new Error('Nenhuma imagem para publicar.');
  if (imageUrls.length > 10) {
    throw new Error(
      `A API do Instagram aceita no máximo 10 imagens por carrossel (você tem ${imageUrls.length}). Reduza os slides.`
    );
  }
  const userId = process.env.IG_USER_ID;

  let creationId;
  if (imageUrls.length === 1) {
    const single = await ig(`${userId}/media`, { image_url: imageUrls[0], caption });
    creationId = single.id;
  } else {
    const children = [];
    for (const url of imageUrls) {
      const item = await ig(`${userId}/media`, { image_url: url, is_carousel_item: 'true' });
      children.push(item.id);
    }
    const carousel = await ig(`${userId}/media`, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption,
    });
    creationId = carousel.id;
  }

  await waitForContainer(creationId);
  const published = await ig(`${userId}/media_publish`, { creation_id: creationId });

  let permalink = '';
  try {
    ({ permalink } = await ig(published.id, { fields: 'permalink' }, 'GET'));
  } catch {
    // permalink é cosmético; não falha a publicação por causa dele
  }
  return { id: published.id, permalink };
}
