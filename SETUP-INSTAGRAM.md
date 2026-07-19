# Configurar a publicação automática no Instagram

A publicação usa a API oficial da Meta. O setup é burocrático mas é feito **uma vez só**.
São 3 chaves no `.env`: `IG_ACCESS_TOKEN`, `IG_USER_ID` e `IMGBB_API_KEY`.

---

## Passo 1 — Converter sua conta para Profissional

1. No app do Instagram: **Perfil → ☰ → Configurações → Tipo de conta → Mudar para conta profissional**.
2. Escolha **Criador de conteúdo** (ou Empresa, tanto faz para a API).

Sem isso a API não funciona — contas pessoais não podem publicar via API.

## Passo 2 — Criar o app na Meta

> **Qual conta usar aqui?** Qualquer conta Facebook/Meta sua — ela é só a "dona"
> administrativa do app e não precisa ter relação com o Instagram que vai postar.
> A conta do Instagram que publica é escolhida no **Passo 3**, quando você faz
> login no Instagram dentro do app e autoriza as permissões — o token fica
> amarrado à conta desse login.

1. Acesse https://developers.facebook.com e faça login com sua conta.
2. **Meus apps → Criar app**.
3. Em casos de uso, escolha algo como **"Outro" → tipo "Empresa"** (ou o fluxo que
   ofereça o produto Instagram).
4. Dê um nome qualquer (ex: "Posts Automaticos") e crie.
5. No painel do app, em **Adicionar produtos**, ache **Instagram** e clique em
   **Configurar** — escolha a opção **"API do Instagram com login do Instagram"**
   (não precisa de Página do Facebook).

## Passo 3 — Conectar sua conta e gerar o token

1. Dentro do produto Instagram do app: **Configuração da API com login do Instagram**.
2. Na seção **Gerar tokens de acesso**, clique em **Adicionar conta** e faça login
   com a sua conta do Instagram (a Profissional do Passo 1).
3. Clique em **Gerar token** ao lado da conta adicionada. Autorize as permissões:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
4. Copie o token gerado (começa com `IG...`). Esse token é de **longa duração (~60 dias)**.
5. O **ID da conta** aparece junto na mesma tela (um número longo). Copie também.

> **Renovação:** o token expira em ~60 dias. Quando a publicação começar a falhar com
> erro de autenticação, gere um novo token nessa mesma tela e troque no `.env`.

## Passo 4 — Chave do imgbb (hospedagem-ponte das imagens)

A API do Instagram não aceita upload direto de arquivo — ela exige uma **URL pública**
e baixa a imagem de lá. O app usa o imgbb como ponte: sobe cada slide com
**expiração automática de 1 hora** (o Instagram baixa em segundos, depois o link morre).

1. Crie conta em https://imgbb.com
2. Pegue a chave em https://api.imgbb.com (botão "Get API key").

## Passo 5 — Preencher o .env e reiniciar

Adicione ao arquivo `.env` na raiz do projeto:

```
IG_ACCESS_TOKEN=IGAA...seu-token...
IG_USER_ID=1784...seu-id...
IMGBB_API_KEY=abc123...
```

Reinicie o servidor (`npm start`). O botão **"Publicar no Instagram"** na interface
passa a funcionar: ele renderiza os slides, sobe as imagens, cria o carrossel e publica
com a legenda da caixa de texto.

---

## Limites e observações

- **Máximo 10 slides por carrossel** via API (limite da Meta). O app avisa se passar.
- **Limite de 100 publicações via API a cada 24h** por conta (muito acima do uso normal).
- A publicação leva ~30–60s (o Instagram processa as imagens antes de publicar).
- O post sai como carrossel normal no feed, idêntico a um post manual.
