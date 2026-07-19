# Posts Automáticos

Transforma textos brutos (transcrições do YouTube, resumos de aula, notas) em carrosséis
prontos para o Instagram — roteirizados por IA (Claude), renderizados em 4 estilos visuais,
com legenda, agendamento e **publicação automática** via API oficial da Meta.

## Funcionalidades

- **Gerar carrossel**: cola um texto ou link do YouTube → IA escolhe o formato
  (passo a passo, mito vs fato, hot take...), escreve os slides e a legenda.
- **4 estilos visuais**: grid bold, editorial/revista, scrapbook/caderno, panorâmico contínuo.
- **Editor**: texto, badges, destaque, ordem, variante clara/escura por slide.
- **Exportar**: PNGs 1080×1350 (resolução máxima do feed).
- **Publicar**: direto no Instagram (conta Professional) com um clique.
- **Agendar**: fila com data/hora; o servidor publica sozinho no horário.
- **Planejar em lote**: um texto-fonte → N posts com ângulos diferentes, 1 por dia.
- **Agenda visual**: lista ou calendário mensal.

## Rodar localmente

```bash
npm install
npx playwright install chromium
cp .env.example .env   # preencha as chaves
npm start              # http://localhost:4173
```

## Rodar permanentemente no Mac

Para usar a velocidade local do Whisper e do FFmpeg sem manter um Terminal aberto,
instale o app como um serviço do seu usuário no macOS:

```bash
npm install
npx playwright install chromium
npm run service:install
```

Antes de instalar, confirme que o `.env` local tem as chaves do Claude, Instagram e
serviço de imagens. Se houver um `npm start` aberto no Terminal, encerre-o para
liberar a porta 4173. Depois abra [http://localhost:4173](http://localhost:4173).

Como o projeto está em um SSD externo, o macOS exige autorização para o processo
automático acessar volumes removíveis. Na primeira instalação, o script abre
**Ajustes do Sistema > Privacidade e Segurança > Acesso Total ao Disco** e revela o
executável exato do Node. Adicione esse executável, ative a permissão e execute
`npm run service:install` novamente.

O código, modelo Whisper, vídeos, agenda e resultados continuam no SSD. No disco
interno ficam somente o plist obrigatório e logs em
`~/Library/Logs/PostsAutomaticos`.

O serviço inicia no login e reinicia se o processo cair. Fechar a aba do navegador
não interrompe processamento nem agendamento. Durante Whisper, FFmpeg ou uma
publicação, o app usa `caffeinate` para impedir repouso por inatividade.

Isso não impede repouso manual, logout, desligamento ou o fechamento da tampa. Se o
Mac estiver indisponível no horário, o post permanece na agenda e é tentado quando o
servidor voltar. Uma interrupção no meio da chamada ao Instagram exige conferência
manual antes de tentar novamente, evitando duplicatas automáticas.

**Conferir o serviço:**

```bash
launchctl print "gui/$(id -u)/com.yrd.posts-automaticos"
```

**Acompanhar logs:**

```bash
tail -f "$HOME/Library/Logs/PostsAutomaticos/server.log" \
  "$HOME/Library/Logs/PostsAutomaticos/server-error.log"
```

**Reiniciar depois de atualizar o código:**

```bash
launchctl kickstart -k "gui/$(id -u)/com.yrd.posts-automaticos"
```

**Remover o serviço sem apagar dados:**

```bash
npm run service:uninstall
```

### Migração segura da VPS para o Mac

1. Confira todos os itens futuros na Agenda da VPS e conclua, remova ou recrie-os no
   Mac.
2. Faça uma publicação manual curta pelo Mac.
3. Faça um agendamento curto e confirme que ele publica sozinho.
4. Somente depois disso, pare a stack no Portainer. Não delete a stack nem seus
   volumes; eles ficam disponíveis como plano de retorno.

Não mantenha agendas independentes ativas no Mac e na VPS ao mesmo tempo, pois os
dois servidores podem publicar conteúdo duplicado.

## Deploy na VPS (Docker)

```bash
git clone <este-repo> posts-automaticos
cd posts-automaticos
cp .env.example .env
nano .env              # preencha TODAS as chaves — inclusive APP_PASSWORD!
docker compose up -d --build
```

Pronto: interface em `http://SEU_IP:4173`, protegida por senha (`APP_PASSWORD`;
usuário pode ser qualquer coisa). O agendador roda 24/7 — posts agendados saem
no horário mesmo com seu computador desligado.

**Atualizar depois de mudanças no código:**

```bash
git pull && docker compose up -d --build
```

**Ver logs (inclusive do agendador):**

```bash
docker compose logs -f
```

### Notas importantes

- `APP_PASSWORD` é obrigatória na VPS — sem ela a interface fica aberta pra
  qualquer um publicar na sua conta.
- O fuso do agendador é `America/Sao_Paulo` (ajuste no `docker-compose.yml` se precisar).
- `data/` (agenda + carrossel atual) e `output/` (PNGs) ficam persistidos fora do
  container — sobrevivem a rebuilds.
- O token do Instagram expira a cada ~60 dias — gere outro no app da Meta e
  atualize o `.env` (ver [SETUP-INSTAGRAM.md](SETUP-INSTAGRAM.md)).

## Chaves necessárias (.env)

| Chave | O quê | Onde obter |
|---|---|---|
| `ANTHROPIC_API_KEY` | IA que roteiriza os posts | platform.claude.com |
| `IG_ACCESS_TOKEN` | Token da conta do Instagram | developers.facebook.com (ver SETUP-INSTAGRAM.md) |
| `IG_USER_ID` | ID numérico da conta | mesma tela do token |
| `IMGBB_API_KEY` | Ponte de imagens (opcional — tem fallback sem chave) | api.imgbb.com |
| `APP_PASSWORD` | Senha da interface | você escolhe |
