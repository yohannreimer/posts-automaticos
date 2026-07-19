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
