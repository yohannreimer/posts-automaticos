// A API do Instagram só aceita imagens via URL pública — ela mesma baixa
// o arquivo. Este módulo sobe cada slide num host temporário e devolve a URL.
//
// Provedores (em ordem):
//   1. imgbb (se IMGBB_API_KEY estiver no .env) — expiração de 1h
//   2. litterbox (catbox.moe) — sem chave, expiração de 1h
//
// Em ambos, o Instagram baixa a imagem em segundos e o link morre sozinho.

export function imghostEnabled() {
  return true; // litterbox não precisa de chave
}

async function uploadImgbb(buffer, name) {
  const form = new FormData();
  form.set('image', buffer.toString('base64'));
  form.set('name', name);
  const url = new URL('https://api.imgbb.com/1/upload');
  url.searchParams.set('key', process.env.IMGBB_API_KEY);
  url.searchParams.set('expiration', '3600');
  const res = await fetch(url, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(`imgbb ${res.status}: ${JSON.stringify(data.error || data)}`);
  }
  return data.data.url;
}

async function uploadLitterbox(buffer, name) {
  const form = new FormData();
  form.set('reqtype', 'fileupload');
  form.set('time', '1h');
  form.set('fileToUpload', new Blob([buffer], { type: 'image/png' }), `${name}.png`);
  const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: form,
  });
  const text = (await res.text()).trim();
  if (!res.ok || !text.startsWith('https://')) {
    throw new Error(`litterbox ${res.status}: ${text.slice(0, 200)}`);
  }
  return text;
}

export async function uploadPublicImage(buffer, name = 'slide') {
  const errors = [];
  if (process.env.IMGBB_API_KEY) {
    try {
      return await uploadImgbb(buffer, name);
    } catch (err) {
      errors.push(err.message);
    }
  }
  try {
    return await uploadLitterbox(buffer, name);
  } catch (err) {
    errors.push(err.message);
  }
  throw new Error(`Falha no upload temporário das imagens: ${errors.join(' | ')}`);
}
