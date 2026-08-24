# 🧠 Creative Insights - Visão Geral do Projeto

Este documento serve como o registro central da visão, finalidade, arquitetura e regras de negócio do projeto **Creative Insights**. Ele deve ser usado como guia absoluto para manter a consistência em futuras manutenções, implementações e expansões da plataforma.

## 🎯 1. Finalidade do Projeto
O **Creative Insights** é uma plataforma proprietária e avançada de inteligência de marketing (Growth). Sua principal finalidade é **empoderar a equipe criativa e de performance** através de uma visão clara, imediata e acionável sobre o desempenho dos anúncios veiculados na Meta (Facebook/Instagram Ads).

Ao invés de depender de tabelas confusas no Gerenciador de Anúncios, o sistema cruza dados financeiros, extrai mídias em alta resolução e aplica uma camada de Inteligência Artificial para gerar insights sobre **o que funciona, o que não funciona e por quê**, filtrando os dados até a granularidade de cada criador (Designer/Videomaker).

---

## 🛠️ 2. Stack Tecnológico e Arquitetura

O projeto foi construído utilizando as melhores práticas modernas de desenvolvimento web:

* **Frontend & Backend (Fullstack):** Next.js (App Router), React, TypeScript.
* **Estilização:** CSS Modules e CSS global (`globals.css`) com variáveis semânticas.
* **Banco de Dados:** SQLite, gerenciado via **Prisma ORM**.
* **Integrações Externas:** 
  * **Meta Graph API (v19.0):** Para extração do histórico de anúncios e imagens nativas.
  * **Inteligência Artificial (Gemini):** Para atuar como o "AI Director" gerando hipóteses criativas.

### Arquitetura de Sincronização (Motor de Dados)
A aplicação **não** consome os dados da Meta em tempo real toda vez que a página é carregada. Isso foi desenhado para garantir ultra-velocidade na interface.
* **Rota `/api/sync-meta`:** É ativada manualmente pelo usuário. Ela busca os dados dos últimos 30 dias (incluindo o dia atual com `time_range`) separados dia a dia (`time_increment=1`).
* O banco de dados salva o histórico na tabela `AdDailyMetrics`, utilizando a chave única `adCreativeId + data`.
* **Rota `/api/db-ads`:** Consome o banco de dados interno e entrega as somatórias dos dados em frações de segundo, permitindo ao usuário navegar rapidamente entre os históricos (Ex: Hoje, 7 dias, 15 dias).

#### Escopo da sincronização (custo de API)
A conta de anúncios tem ~9.500 anúncios no total, mas a grande maioria é de testes antigos pausados. Para manter a consulta à Meta viável (a própria API rejeita chamadas grandes demais com o erro `"Please reduce the amount of data you're asking for"`), o sync aplica dois cortes:
* **Filtra por `effective_status: ["ACTIVE"]`** — apenas anúncios ativos entram na sincronização (~1.100), e o resultado é paginado por completo (seguindo `paging.next`), não só a primeira página de 100.
* **Só busca o bloco pesado de criativo (`adcreatives`/`object_story_spec`/`asset_feed_spec`, usado para resolver imagem/vídeo) para anúncios que ainda não existem no banco.** Esse bloco praticamente nunca muda depois que o anúncio é criado, então anúncios já conhecidos só atualizam as métricas diárias a cada sincronização, sem re-buscar imagem/hash.

---

## 🎨 3. Design System e UI/UX

O design visual é um pilar crucial da plataforma. Ele deve transparecer o nível "Premium" de uma ferramenta corporativa dedicada, adotando a identidade visual da **Allu**.

* **Paleta de Cores:**
  * **Primária (Allu Neon Green):** `#4BD184` (Usada em botões de CTA, valores altos de ROAS, borders de hover, e destaques ativos).
  * **Backgrounds:** Gradient suave de `#F4F4EF` a `#DFDFD4` (Claro) e tons verdes muito escuros como `#1A3B1F` para Background e Cards (Escuro).
  * **Cores de Alerta/Secundárias:** Amarelo/Laranja suave `var(--warning)` para destacar áreas de testes e métricas limpas (Pedidos Líquidos).
* **Comportamento Visual (Micro-interações):**
  * Elementos em Glassmorphism (`.glass-panel`) para dar um aspecto limpo.
  * **Hover nos Cards:** Ao passar o mouse sobre um criativo, ele recebe uma borda brilhante neon verde e sobe sutilmente (`translateY`). 
  * **Sistema de Zoom:** Ao clicar na imagem cortada de um criativo (agora todas formatadas em `1:1 quadrado`), abre-se um balão lateral usando `createPortal` que expande a imagem para visualização total, com um fundo desfocado (blur) por trás.

---

## 📊 4. Regras de Negócio e Métricas

### Identificação de Responsáveis
A API lê o campo `name` dos anúncios buscando assinaturas/tags via Regex, como `_RM` ou `_PP`. Isso mapeia automaticamente o anúncio para o seu Designer criador, permitindo a filtragem no dashboard.

### Estrutura de Métricas
As métricas globais e unitárias coletadas são:
* **Gasto (Spend):** Investimento financeiro.
* **ROAS:** Retorno sobre o investimento. É calculado através do evento `omni_purchase`. A média global do ROAS é sempre uma **média ponderada baseada no gasto**, não uma média aritmética simples.
* **CPM, CPC, CTR:** Métricas clássicas de atenção e leilão.
* **Conversas no WhatsApp:** Mapeada pelo evento `onsite_conversion.messaging_conversation_started_7d`.
* **Pedidos Líquidos:** Métrica customizada extraída do evento `offsite_conversion.custom.2105075753380751` (que reflete o evento `risk_approved_cc` configurado na Meta). Usada para medir o impacto **real** (pago/aprovado) que um criativo gerou, indo além do "Total Purchases" genérico.

### Classificação de Criativos (Winners / Super Winners / Testes)
O dashboard classifica cada criativo em uma das três categorias, **delimitado estritamente pelo período selecionado no filtro** (Última hora / Última semana / Últimos 15 dias / Último mês) — nada de histórico acumulado:
* **Super Winner** 🌟: gasto no período ≥ R$ 1.000 **e** Valor Aprovado no período ≥ R$ 5.000.
* **Winner** 🏆: gasto no período ≥ R$ 1.000 **e** Valor Aprovado no período ≥ R$ 1.000.
* **Área de Testes**: todo o resto (qualquer gasto, qualquer valor), agrupado por conjunto de anúncios.

Além das métricas, o próprio anúncio só é considerado se foi **criado (`created_time` da Meta) dentro da janela do filtro** — um anúncio "perene" criado há meses fica de fora de qualquer um dos 4 filtros, mesmo que tenha tido gasto/resultado expressivo dentro do período selecionado. Essa é uma decisão de produto deliberada (confirmada em 30/07/2026): o dashboard prioriza mostrar o que foi **lançado** dentro da janela, não apenas o que teve atividade nela.

### Filtro de Período
Opções disponíveis: **Última hora** (na prática, filtra pelo dia de hoje — o banco só guarda métricas em granularidade diária, não por hora), **Última semana** (7 dias), **Últimos 15 dias**, **Último mês** (30 dias).

---

## 🤖 5. Inteligência Artificial (AI Director)
A plataforma possui um botão integrado nos cards dos criativos para acionar o "AI Director".
* Para não gastar créditos deliberadamente, a IA é executada **sob demanda (manual)**.
* Ao clicar, o sistema envia todos os dados históricos de performance daquele anúncio específico + a imagem para o Gemini.
* A IA devolve uma hipótese clara, em poucas palavras, do **por que** aquele criativo está perforando daquela maneira, entregando insights para as próximas refações ou escalas.

---

## 🗺️ 6. Roadmap / Pendências

* Nenhuma pendência conhecida no momento. (Resolvido em 30/07/2026: o sync deixava de fora qualquer anúncio além dos 100 primeiros retornados sem filtro nem paginação — por isso criativos de altíssima performance, como um lançado em 04/07 com Valor Aprovado acima de R$30.000, nunca eram sincronizados. Corrigido filtrando por `effective_status: ACTIVE` com paginação completa, e buscando o bloco de imagem/vídeo só para anúncios novos, para manter a consulta leve.)
