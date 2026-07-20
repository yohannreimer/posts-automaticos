# Analytics — Fases 2 e 3

## Objetivo

Concluir a aba Análise já existente, tornando score e gráficos confiáveis e fechando o relatório semanal e o loop de aprendizado do gerador sem substituir ou descartar a Fase 1.

## Estado preservado

- SQLite local em `data/analytics.db` com mídia, snapshots e metadados.
- Sincronização automática a cada seis horas.
- Cards, tabela, sparklines, presets de score, alertas, relatório e mineração de comentários já iniciados.
- Geração de carrosséis e Reels já aceita um contexto textual de aprendizados.

## Decisões

### Score confiável

O score será calculado no servidor sobre o conjunto completo de posts, nunca sobre o filtro visível. Métricas indisponíveis serão removidas do denominador em vez de virarem zero. O resultado receberá um fator de confiança progressivo baseado no alcance, para impedir que uma taxa alta com duas pessoas alcançadas pareça vencedora.

Os pesos de saves, shares, engajamento, follows e views, além do alcance mínimo confiável, serão editáveis e persistidos no SQLite. Presets continuarão disponíveis apenas como atalhos.

### Evolução

A tela manterá os sparklines por post e ganhará um gráfico agregado de views e alcance. A série agregada usará carry-forward do snapshot mais recente de cada post, evitando quedas artificiais quando posts antigos não forem fotografados na mesma rodada.

### Relatório semanal

Relatórios serão armazenados por semana em uma tabela própria, com período, horário, markdown e dados de comparação. Gerar novamente a mesma semana atualizará aquele relatório; semanas anteriores permanecerão disponíveis.

O relatório automático de segunda-feira continuará existindo, mas uma falha da IA não transformará uma coleta de métricas bem-sucedida em coleta com erro.

### Loop de aprendizado

O contexto usado pelo gerador será construído deterministicamente a partir de posts com amostra mínima e score confiável. Melhores e piores exemplos não poderão se sobrepor. O usuário poderá visualizar e ligar/desligar esse contexto na aba Análise.

O contexto será aplicado à escolha de ângulos, geração de carrosséis e planejamento de Reels. O texto livre do relatório semanal não será injetado automaticamente no gerador.

### Comentários

A mineração informará quantos posts falharam por permissão/API e recarregará as últimas ideias salvas. Erros não serão tratados silenciosamente como ausência de comentários.

## Validação

- Testes unitários para normalização, confiança, métricas ausentes e aprendizados.
- Testes de persistência do score e histórico semanal em SQLite temporário.
- Verificação de sintaxe dos módulos e execução da suíte completa.
- Inspeção da aba local com os dados reais existentes.
