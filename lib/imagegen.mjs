// Geração de imagem via Replicate (FLUX schnell — rápido e barato).
// Requer REPLICATE_API_TOKEN no .env (https://replicate.com/account/api-tokens).

export function imagegenEnabled() {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}

// Prefixo fixo que amarra o estilo visual entre gerações — é isso que
// mantém a consistência entre posts diferentes.
const STYLE_LOCK =
  'Editorial magazine photography, moody cinematic lighting, strong film grain, ' +
  'muted desaturated tones, dark atmospheric background, shallow depth of field, ' +
  'no text, no words, no letters, no watermark. ';

export async function generateCoverImage(prompt) {
  if (!imagegenEnabled()) {
    throw new Error(
      'REPLICATE_API_TOKEN não configurado no .env (crie em replicate.com/account/api-tokens).'
    );
  }
  const res = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt: STYLE_LOCK + prompt,
          aspect_ratio: '4:5',
          output_format: 'jpg',
          output_quality: 90,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Replicate respondeu ${res.status}: ${await res.text()}`);
  const prediction = await res.json();
  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!outputUrl) {
    throw new Error(`Geração falhou: ${prediction.error || prediction.status}`);
  }
  const imgRes = await fetch(outputUrl);
  if (!imgRes.ok) throw new Error(`Falha ao baixar imagem gerada (${imgRes.status}).`);
  return Buffer.from(await imgRes.arrayBuffer());
}
