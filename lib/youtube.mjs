import { YoutubeTranscript } from 'youtube-transcript';

export async function fetchYoutubeTranscript(url) {
  if (!url || !/youtube\.com|youtu\.be/.test(url)) {
    throw new Error('Cole um link válido do YouTube.');
  }
  let items;
  try {
    // tenta português primeiro, depois qualquer idioma disponível
    items = await YoutubeTranscript.fetchTranscript(url, { lang: 'pt' }).catch(() =>
      YoutubeTranscript.fetchTranscript(url)
    );
  } catch (err) {
    throw new Error(
      'Não consegui baixar a transcrição desse vídeo. Verifique se ele tem legendas/CC disponíveis. ' +
        `(${err.message})`
    );
  }
  if (!items || !items.length) {
    throw new Error('Esse vídeo não tem transcrição disponível.');
  }
  const text = items
    .map((i) => i.text)
    .join(' ')
    .replace(/&amp;#39;/g, "'")
    .replace(/&amp;quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}
