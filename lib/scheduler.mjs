export async function recoverInterruptedPublications({
  readQueue,
  updateItem,
  logger = console,
}) {
  const queue = await readQueue();
  const interrupted = queue.filter((item) => item.status === 'publishing');

  for (const item of interrupted) {
    await updateItem(item.id, {
      status: 'unknown',
      error:
        'O app foi interrompido durante a publicação. Confira o Instagram antes de tentar novamente para evitar duplicidade.',
    });
    logger.warn?.(`[agendador] publicação incerta em "${item.title}" (${item.id})`);
  }

  return interrupted.length;
}

export async function runDuePublications({
  readQueue,
  updateItem,
  publishItem,
  withAwake = (task) => task(),
  now = () => new Date(),
  logger = console,
}) {
  const queue = await readQueue();
  const currentTime = now();
  const currentIso = currentTime.toISOString();
  const due = queue.filter(
    (item) => item.status === 'scheduled' && item.scheduledAt && item.scheduledAt <= currentIso
  );

  for (const item of due) {
    logger.log?.(`[agendador] publicando "${item.title}" (${item.id})...`);
    await updateItem(item.id, { status: 'publishing', error: '' });

    try {
      const result = await withAwake(() => publishItem(item));
      await updateItem(item.id, {
        status: 'published',
        remoteId: result?.id || '',
        permalink: result?.permalink || '',
        publishedAt: currentIso,
        error: '',
      });
      logger.log?.(`[agendador] publicado: ${result?.permalink || result?.id || item.id}`);
    } catch (error) {
      await updateItem(item.id, { status: 'error', error: error.message });
      logger.error?.(`[agendador] erro em "${item.title}": ${error.message}`);
    }
  }

  return due.length;
}
