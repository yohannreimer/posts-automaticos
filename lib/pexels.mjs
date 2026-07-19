// Busca de fotos no Pexels. Requer PEXELS_API_KEY no .env
// (grátis em https://www.pexels.com/api/).

export function pexelsEnabled() {
  return Boolean(process.env.PEXELS_API_KEY);
}

// Retorna um Buffer com a foto (orientação retrato) ou lança erro descritivo.
export async function fetchPexelsPhoto(query, { skip = 0 } = {}) {
  if (!pexelsEnabled()) {
    throw new Error('PEXELS_API_KEY não configurada no .env (grátis em pexels.com/api).');
  }
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'portrait');
  url.searchParams.set('per_page', String(skip + 1));

  const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } });
  if (!res.ok) throw new Error(`Pexels respondeu ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const photo = data.photos?.[skip] || data.photos?.[0];
  if (!photo) throw new Error(`Nenhuma foto encontrada para "${query}".`);

  const imgRes = await fetch(photo.src.large2x || photo.src.large);
  if (!imgRes.ok) throw new Error(`Falha ao baixar a foto (${imgRes.status}).`);
  return Buffer.from(await imgRes.arrayBuffer());
}
