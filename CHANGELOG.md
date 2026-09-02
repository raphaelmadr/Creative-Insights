# Changelog: Creative Insights (Fase 1)
Data: 31 de Agosto de 2026

## 🚀 Novas Funcionalidades: Ambiente de Desenvolvimento
* **Bypass de Login (Localhost):** Adicionado suporte a login de desenvolvimento rápido (Bypass) sem necessidade de credenciais de produção. Em ambiente de desenvolvimento local (`NODE_ENV === 'development'`), a tela de login exibe um botão de "Bypass Login" que usa o provedor `Credentials` para autenticar um usuário estático (dev@allugator.com), agilizando a implementação e teste de features.

## 🐛 Correções de Bugs & Regras de Negócio (Setembro 2026)
* **Critérios Flexíveis para Winners e Super Winners:** A lógica de classificação de "Winners" e "Super Winners" foi ajustada. Anteriormente, era obrigatório que as 3 métricas estivessem configuradas para ranquear os anúncios. Agora, caso o usuário defina `0` em qualquer uma das três metas de corte (Investimento, Receita Líquida ou CPA), o sistema ignorará a meta com valor 0 e utilizará apenas as outras métricas para validar o anúncio.
* **Sincronização Profunda do TikTok Ads:** Corrigido um problema gravíssimo onde as imagens dos anúncios do TikTok (criativos) não estavam sendo carregadas na interface e apareciam com links quebrados. O botão de "Sincronizar Redes -> Sincronização Profunda" estava ignorando o parâmetro e acionando sempre a versão métrica rápida. Agora, ao acionar a sincronização profunda, o sistema extrairá com sucesso as capas de vídeo no TikTok em alta definição e atualizará os painéis antigos que estavam quebrando as imagens.

## 🚀 Novas Funcionalidades: Motor de Sincronização TikTok Ads
* **Integração com a Marketing API (v1.3):** Adicionado suporte para leitura de desempenho e listagem de anúncios na plataforma TikTok Ads, permitindo uma visão cross-channel.
* **Módulo `lib/tiktok-sync.ts`:** Motor exclusivo para orquestrar a ingestão de dados, respeitando paginação e transformando os relatórios de conversão em métricas padronizadas para nosso banco (upserting em `AdCreative` e `AdDailyMetrics`).
* **Sincronização Simultânea:** Atualizado o `NotificationProvider.tsx` para sincronizar a Meta, TikTok e buscar novidades em um fluxo contínuo quando acionado via botão "Sincronizar" (Rápido ou Profundo).
* **Fix de Vazamento de Conexão no Prisma:** Corrigido problema gravíssimo de `CLIENT_FETCH_ERROR` onde as rotas instanciaram múltiplos `new PrismaClient()` estourando a conexão de banco de dados (`192.109.11.49:3306`). O projeto inteiro agora adere ao padrão de Singleton do Prisma.

---

## 🏗️ 1. Arquitetura e Banco de Dados (Prisma + SQLite)
Migramos a ferramenta de requisições "Ao Vivo" puras para um robusto sistema de cache local com banco de dados.

* **Novos Modelos de Dados:** Foram criadas as tabelas `AdCreative` (para guardar informações estáticas do anúncio) e `AdDailyMetrics` (para armazenar as métricas em formato diário, garantindo que o histórico nunca se perca).
* **Motor de Sincronização (`/api/sync-meta`):** A nova rota de API baixa automaticamente o desempenho dos últimos 30 dias na Meta (via `time_increment=1`) separando dia a dia, e consolida tudo no banco através de operações de Upsert.
* **Filtros Históricos Locais (`/api/db-ads`):** A leitura de dados agora é feita internamente através do Prisma, permitindo o filtro instantâneo (sem delay) entre "Hoje (Ao Vivo)", "7 dias", "15 dias" e "30 dias".
* **Correção de "Hoje (Ao Vivo)":** Ajustamos a consulta à API do Meta, trocando o `date_preset(last_30d)` limitante por um `time_range` customizado, assegurando que os dados intrashift do dia vigente sejam sempre capturados durante a sincronização.

---

## 📊 2. Integração Avançada com Meta Ads API
Refinamos significativamente o que extraímos do Facebook Graph API para ter dados precisos e imagens utilizáveis.

* **Resolução de Imagens Quebradas:** Como a Meta não devolve links de imagens de anúncios perenes via Graph tradicional de Insights, construímos uma rotina que extrai o `image_hash` dos anúncios e faz uma segunda chamada à API (`/adimages`) para resgatar a URL nativa em altíssima resolução.
* **Métrica de "Pedidos Líquidos" (Risk Approved):** Descobrimos e mapeamos o evento de Custom Conversion (`risk_approved_cc`, ID: 2105075753380751). Adicionamos a coluna `netOrders` ao banco de dados e à rotina de sincronização para medir não só o faturamento bruto, mas as vendas válidas (limpas) de cada criativo.

---

## 🎨 3. Interface Visual e Experiência
### IA (Inteligência Artificial)
- **Panorama Geral por Conjuntos**: A IA agora analisa até 100 anúncios ativos de uma vez, processando os campos de `adset_name` e `campaign_name`. O prompt foi reestruturado para gerar obrigatoriamente uma visão macro (Panorama Geral) agrupando a performance por conjuntos de anúncios antes de gerar insights individuais.

### UI/UX
- **Filtro de Status de Anúncios:** Adicionado um toggle no cabeçalho do Dashboard Criativo permitindo alternar a visualização entre anúncios Ativos, Desativados (Inativos) ou Todos, com atualização dinâmica do banco de dados local.
- **Clarificação do Escopo de Exibição:** Adicionado um aviso sutil e elegante (sem novas caixas) no topo do Dashboard Criativo informando o status dos anúncios exibidos. A cor do aviso adapta-se dinamicamente ao filtro selecionado.
- **Redesign do Dashboard de Entregas:** A página `/entregas` foi reformulada para focar na gestão macro da equipe.
  - Implementação de um painel de **Meta Global da Equipe** com barra de progresso (calculada sobre todas as peças computadas).
  - Troca do Ranking Simples por um painel de **Produção por Profissional**, listando *todos* os membros da equipe (mesmo os zerados) em cards individuais com layout Glassmorphism.
  - Reorganização do Feed de mensagens capturadas.
- **Configurações:** Adicionada a configuração de **Meta Global do Time (peças/mês)** dentro da aba Equipe.

### Banco de Dados & API
- **Modelagem (`SystemSettings`):** Adicionado campo `teamCreativeGoal` para armazenar a meta de produção do time de design.
- **API `/api/deliveries`:** Alterada a lógica de busca para realizar um relacionamento estendido (Left Join lógico), garantindo o retorno de todos os criadores registrados na plataforma, independente de possuírem entregas no mês vigente.
* **Aplicação do Design System Allu:** Toda a plataforma recebeu a paleta oficial: verdes vibrantes (`#4BD184`), modos de fundo quentes/escuros (`#DFDFD4`, `#1A3B1F`) para garantir um visual proprietário e premium.
* **Cards Quadrados (1:1):** As imagens dos criativos agora são forçadas para `aspect-ratio: 1 / 1` com `object-fit: cover`, garantindo alinhamento perfeito na grade de visualização.
* **Destaques de Hover:** Resolvemos bugs visuais de bordas aplicadas excessivamente, garantindo que o "Neon Green" hover aplique exclusivamente sobre os cards de criativo, destacando o item ativo de forma elegante.
* **Balão de Zoom Inteligente:** Removemos a limitação de cortes de imagens. Agora, **ao clicar** na imagem de um criativo, um portal flutuante exibe a miniatura expandida na tela inteira, ao lado do cursor, sem quebrar o layout interno da página. Um overlay "borra" (backdrop-filter) o resto da página para foco total.

---

## 🧠 4. Inteligência Artificial e Otimização
* **Análise de IA Sob Demanda:** Alteramos a execução do "AI Director Analysis" de automática (que consumia créditos em excesso) para manual. Agora, existe um botão "Analisar com IA" que gera as hipóteses dinamicamente apenas para os anúncios que você julgar necessários analisar, economizando custos e deixando o site mais leve.

---

## 👥 5. Organização e Time
* **Extração de Responsável (Designer/Videomaker):** Implementamos Regex no nome das campanhas (`_RM`, `_PP`, etc.) para extrair automaticamente a autoria daquela peça gráfica.
* **Toggle de Filtro por Criador:** Adicionamos um menu rápido (pílulas) no topo da área de criativos, permitindo a separação e acompanhamento individual da performance de cada Designer/Copywriter com um único clique.

---

## 📈 Atualização Recente (Setembro 2026)

### 🎯 1. Metas Mensais de KPIs (Goals & Pace)
Implementado um novo sistema robusto para acompanhamento de ritmo de metas no Dashboard Criativo.
* **Configuração por Mês:** A aba de Configurações agora possui um gerenciador de "Metas KPIs" onde é possível definir valores específicos de Investimento (Spend), Receita Líquida (Valor Aprovado) e CPA para cada mês do ano.
* **Histórico Preservado:** A arquitetura do banco de dados salva a meta referente ao mês específico. Quando o calendário é alterado para meses anteriores, a plataforma busca e exibe a respectiva meta daquela data.
* **Indicador de Pace:** Os 3 principais *cards* de KPI do dashboard exibem em tempo real o indicador "Meta: R$ XXX | Pace: YYY%", calculando a porcentagem de atingimento de meta de acordo com o calendário selecionado.

---

## 📈 Atualização Passada (Agosto 2026)

### 📊 1. Filtros de Período na Similaridade
A página de **Similaridade (Auditoria de Entity IDs)** agora possui os mesmos filtros de período avançados presentes no Dashboard criativo.
* **Busca Dinâmica:** Em vez de travar os dados nos últimos 7 dias via código, a interface agora permite filtrar e comparar a Fadiga Cruzada "Hoje", "Mês Atual" ou em qualquer "Período Selecionado", gerando comparações muito mais precisas e relativas ao contexto selecionado.
### 👥 2. Gestão de Equipe Aprimorada
A página de **Equipe e Configurações** recebeu melhorias substanciais para garantir que os dados fiquem limpos e históricos seguros:
* **Edição de Criadores:** Adicionado fluxo completo para editar informações (Nome, Sigla, Meta Financeira e Meta de Volumetria) de membros da equipe sem a necessidade de excluir e recadastrar, mantendo os relacionamentos do banco de dados intactos.
* **Metas de Volumetria:** Implementada uma nova métrica no cadastro de criadores (`monthlyVolumeGoal`). Agora, além da meta financeira, cada profissional possui um objetivo de entrega de peças por mês, exibido diretamente no card do dashboard da equipe com uma barra de progresso visual.
* **Preservação de Dados (Outros/Não Identificado):** O banco de dados agora salva de maneira robusta (através de um perfil âncora invisível) todos os registros passados de anúncios que não possuem identificação de autor, garantindo que CPAs e Receitas Líquidas de meses anteriores nunca sumam.
* **Métrica Fiel de Anúncios Ativos:** A contagem de anúncios por criador no dashboard da equipe foi reescrita para refletir com exatidão matemática o que está online no momento. O sistema agora extrai e armazena os campos `status` e `created_time` diretamente da Meta. Assim, a contagem de "X anúncios" considera estritamente campanhas **ativas** (`ACTIVE`) que foram **criadas dentro do mês selecionado**, removendo automaticamente anúncios pausados ou herdados de meses anteriores da contagem visual.

### ⚙️ 3. Nova Arquitetura do Motor de Sincronização (Meta Ads)
O coração da ferramenta (`/api/sync-meta`) foi reescrito para proteger a API da Meta contra timeouts (Rate Limits) e melhorar a velocidade.
* **Fast-Track (Mês Atual):** O botão de "Sincronizar" agora puxa instantaneamente **apenas o mês vigente**, deixando a interface responsiva em menos de 5 segundos.
* **Orquestração em Segundo Plano:** Após o sync rápido, o seu navegador toma a liderança e enfileira chamadas silenciosas (com delays estratégicos de 3 segundos) para buscar progressivamente o histórico dos últimos 6 meses, alimentando o banco sem travar a Vercel.
* **Segurança de API Key:** Adicionada rotina de saneamento para injetar silenciosamente o prefixo `act_` caso o usuário insira apenas os números da conta de anúncios, evitando o temido erro `#100 (insights)`.

### 📩 4. Integração com Slack (Dashboard de Entregas)
O módulo de **Entregas** foi recriado para auditar de forma inteligente as entregas de toda a equipe a partir das mensagens enviadas em um canal do Slack.
* **Leitura Estruturada (Regex):** Através da rota (`/api/sync-slack`), o sistema lê as mensagens de um grupo no Slack e extrai matematicamente o número de peças utilizando a nomenclatura padronizada dos arquivos (ex: `10peças` e a sigla do autor `_RM_`), zerando o custo com IA.
* **Dashboard Unificado (Dashboard da Equipe):** A tela isolada de Entregas foi extinta e perfeitamente unificada à tela de **Equipe**. Agora, um único painel exibe o cruzamento perfeito entre a métrica de Esforço (Peças Produzidas via Slack) e a métrica de Resultado (Receita Líquida e ROAS via Meta Ads), gerando o painel gerencial definitivo da plataforma.
* **Múltiplas Siglas e Tolerância a Pontuação:** A aba Equipe nas configurações permite o cadastro de até 3 siglas para um mesmo criador. O motor de extração foi aprimorado para detectar essas siglas de forma flexível, reconhecendo-as caso estejam separadas por aspas, underlines, hífens ou qualquer outra pontuação (`[^a-zA-Z0-9]`).
* **Estrutura Resiliente (Upsert):** As entregas são vinculadas permanentemente ao banco de dados via "Slack Timestamp" (slackTs). Usamos a lógica de "Upsert" para que o sistema possa atualizar e corrigir retroativamente métricas analisadas de forma incorreta no passado, impedindo qualquer duplicidade.
* **Sincronização Profunda Paginada:** O botão de sincronizar no Slack foi unificado para fazer uma varredura completa (paginada de 500 em 500) em todo o histórico do mês selecionado, garantindo exatidão no leaderboard.
* **Contabilização de Áreas Externas (Parcerias):** Mensagens detectadas com peças válidas, porém com siglas desconhecidas ou externas, são automaticamente capturadas e atribuídas a um card dinâmico de nome "Parcerias", impossibilitando vazamento de produção que subiu no canal.

### 🧠 2. Análise Multimodal por IA Sob Demanda
O insight gerado pelo "AI Director" (Gemini) passou por um aprimoramento estrutural na aba de Similaridade.
* **Análise Visual (Imagens Reais):** A IA não se baseia mais apenas em deduzir o conteúdo pelos *nomes* dos criativos. Quando ativada, a nova rota `/api/similaridade/analyze` faz o download das mídias originais da Meta, converte em Base64 e passa ao modelo para que ele "enxergue" de fato o quão semelhantes (visualmente) as variações são.
* **Sob Demanda (Economia e Foco):** A análise de IA automática (que travava a página esperando o retorno do Gemini para todos os grupos) foi removida. Agora existe um botão dedicado "Analisar Imagens com IA" em cada item de comparação, que busca a hipótese e recomendação sob demanda e com contexto focado.

### 🛡️ 3. Sistema de IA Multiprovedor com Fallback Automático
O núcleo de requisições de Inteligência Artificial (`lib/ai.ts`) atua como um orquestrador resiliente e multiprovedor.
* **Tolerância a Falhas Expansiva (Novo Fallback):** Expandimos a rede de segurança. Caso o Gemini falhe, a plataforma agora recorre a uma esteira priorizada focada em velocidade e custo-benefício, acionando sequencialmente: **Groq**, **OpenRouter**, **OpenAI**, **Anthropic**, **Cohere** e, em último caso, a Inference API do **Hugging Face**.
* **Tradutor Multimodal Universal:** A plataforma abstrai as diferenças técnicas de como passar "imagens" para a IA. Modelos baseados em texto (como os da Cohere e Hugging Face) ignoram mídias com segurança, enquanto provedores que suportam Visão Computacional (como Groq via LLaVA/Llama 3.2 e OpenRouter) recebem as imagens normalmente.
* **Garantia de Entrega:** Nenhum insight de similaridade, dashboard ou hipótese criativa será perdido por falha de uma única infraestrutura de IA. A operação está 100% à prova de falhas de terceiros.

### ⏱️ 4. Sincronização Automática Contínua (Cron Job)
Foi configurada uma automação serverless (Cron) para realizar a extração e atualização de dados da Meta no banco de forma 100% automática a cada 30 minutos.
* **Refatoração do Sync (`lib/meta-sync.ts`):** O código de extração da Meta API que estava restrito a uma rota de stream (botão de Sincronizar) foi isolado numa biblioteca independente e reutilizável.
* **Integração com Vercel Crons:** Foi criado o endpoint `GET /api/cron/sync-meta` que agora é acionado automaticamente pelo gatilho configurado no arquivo `vercel.json` (`schedule: "*/30 * * * *"`), garantindo que a equipe tenha dados atualizados sem precisar clicar em nenhum botão.

### 🎨 5. Ajustes de UI nos Cards de Criativos
Os mini-cards de métricas dentro de cada criativo receberam um upgrade visual.
* **Agrupamento 2x2:** As métricas financeiras (Investimento, CPA, Receita Bruta, Receita Líquida) foram divididas em duas linhas elegantes, com o nome da campanha (ad_name) em destaque à esquerda, tornando a visão geral mais equilibrada e responsiva.

### 🤖 IA & Processamento Analítico
14. **Transição de JSON para Texto Puro (Markdown):** 
    - Atendendo a solicitação, todas as Prompts (Meta Insights, Market Insights) e rotas de processamento da IA (`insights/meta`, `insights/news`, `insights/news/cron`) foram inteiramente refatoradas para abolir o formato JSON.
    - O banco de dados (`SystemSettings`) foi atualizado para forçar os modelos de IA a responderem em Markdown cru.
    - Componentes de UI (como `app/analises/[id]/page.tsx` e `app/insights/page.tsx`) agora suportam e renderizam formatação Markdown nativamente utilizando `whiteSpace: pre-wrap`.

### 🎯 6. Refinamento de Insights de Mercado (Foco em Criativos)
A aba de **Insights de Mercado** (que varre a internet em busca de tendências) teve seu prompt e sua base de busca rigorosamente ajustados e, agora, **totalmente parametrizáveis pelo painel de configurações**.
* **Busca Direcionada Dinâmica:** O motor de pesquisa do Tavily procura exclusivamente por estudos de caso de *criativos*, *vídeos de alta conversão*, e *design voltado para performance*. O termo exato de busca agora pode ser editado na aba IA do painel de Configurações.
* **Filtro da IA Customizável:** O prompt da IA foi configurado com ordens estritas para ignorar atualizações sistêmicas e focar em *Produção e Design*. Esse prompt completo também está liberado para edição diretamente na interface de Configurações do sistema.
### 🔐 7. Integrações via Banco de Dados (Sem .env)
Toda e qualquer dependência de chaves de API restritas ao arquivo `.env` foi eliminada. 
* **Chaves Dinâmicas:** Agora você tem uma aba **Integrações (API)** no Modal de Configurações, onde pode inserir e alterar as chaves do Meta Ads, Gemini, OpenAI, Anthropic e Tavily diretamente pela interface. A plataforma consulta essas chaves no banco de dados e as injeta nas requisições, permitindo troca imediata em caso de expiração sem precisar realizar deploys ou reiniciar o servidor.

### 👥 8. Relatório de Performance por Criador e Gestão de Metas
Adicionada uma nova infraestrutura focada na equipe criativa, permitindo entender exatamente quanto dinheiro e ROAS cada membro traz para a companhia, com gestão de metas.
* **Configuração de Equipe:** Uma nova aba "Equipe" no modal de Configurações permite o cadastro de nomes, siglas e **Metas Mensais Individuais**.
* **Dashboard de Equipe no Estilo Copylab:** A tela principal da equipe foi transformada em um painel gerencial em Grid com cards focados na **Receita Líquida**, exibindo barras de progresso animadas que medem o atingimento da Meta Mensal de cada pessoa.
* **Histórico e Snapshots Mensais:** O painel agora possui um seletor de Mês e Ano. Quando um mês passado é acessado (ex: Julho/2026), o sistema busca as métricas reais e salva de forma perpétua (Snapshot) em uma nova tabela de Banco de Dados (`CreatorMonthlyReport`), garantindo que os relatórios antigos nunca sejam perdidos.

### ⚡ 9. Sincronização Unificada em Paralelo (Botão Único)
A arquitetura de sincronização manual foi inteiramente repensada para proporcionar uma experiência livre de atritos.
* **Orquestração Paralela:** O sistema agora conta com a função global `syncAll`, que dispara simultaneamente a busca de Entregas/Novidades via Slack e a atualização de métricas do mês atual via Meta API (`Promise.all`).
* **Sincronização Rápida vs. Profunda:** A arquitetura de interface foi aprimorada:
  - **Menu Suspenso (Dropdown):** Os botões expostos no TopBar foram consolidados em um único menu elegante "Sincronizar". Ao clicar, um dropdown exibe as opções de sincronização de forma limpa e organizada.
  - **Status Individualizado:** O banco de dados agora rastreia separadamente a data e hora da última Sincronização Rápida e da última Sincronização Profunda. Esses horários independentes são exibidos embaixo de cada botão correspondente no menu.
  - **Sync Rápido:** Atualiza apenas os números, métricas financeiras (gastos/receitas) e status **apenas do mês atual**. O loop histórico (que reprocessava os últimos 6 meses) foi desativado neste modo, derrubando o tempo de espera de ~30s para cerca de 2 segundos.
  - **Sync Profundo:** Faz o processo completo, iterando e validando mídias (imagens/vídeos/thumbnails) e buscando retrospectivamente dados dos últimos 6 meses.
* **Automação (Cron Jobs) Dinâmica:** O comportamento do servidor que roda em segundo plano (Vercel Cron) agora pode ser configurado diretamente na plataforma.
  - Criada a aba **Geral & Sistema** dentro das configurações globais.
  - Você agora pode **ligar ou desligar** a Sincronização Automática (Cron).
  - Controle de **Intervalo de Execução**: Agora é possível definir exatamente com qual frequência a sincronização de fundo acontece (a cada 30 min, 1 hora, 12 horas, ou até 1 vez por dia), sem precisar modificar código. O servidor valida o tempo exato desde a última execução automatizada antes de gastar recursos.
  - É possível escolher o **modo** como o Cron roda: "Rápida" (poupa créditos da Meta API e é instantânea) ou "Profunda" (garante validação total de mídias, mas consome mais banda/tempo).
* **Manutenção do Contexto Local:** Botões localizados (como o "Forçar Busca Manual" da aba de Insights) foram mantidos intocados para atualizar apenas a funcionalidade daquela tela específica, se o usuário preferir atuar isoladamente.

### 👁️ 10. Exibição Exclusiva de Anúncios Ativos no Dashboard
* **Filtro de Status (`/api/db-ads`):** A busca de criativos para o dashboard da página inicial foi alterada para retornar e contabilizar estritamente anúncios com status `ACTIVE` no Meta Ads. Isso garante que a visualização de faturamento e métricas não seja poluída por anúncios pausados, deletados ou arquivados.

### 📜 11. Refinamento de UX no Dashboard Criativo
* **Glossário (Cards Informativos) 100% Dinâmico:** Adicionada uma seção de cards no topo do dashboard (semelhante à aba de Equipe) explicando claramente as regras de classificação (Super Winners, Winners, Área de Testes) e o aviso sobre a veiculação ativa dos anúncios. Os valores informados e calculados são puxados dinamicamente do painel de Configurações do Sistema.
* **Scroll Infinito Inteligente:** O carregamento manual de anúncios (botão "Carregar mais") foi substituído por um sistema de **Scroll Infinito** baseado em `IntersectionObserver`. Agora a plataforma detecta o final da página e carrega dinamicamente os próximos blocos de anúncios de alta performance e testes de forma fluida, eliminando cliques repetitivos.
* **Simplificação de Layout:** O seletor de visualização (Grade/Lista) foi removido. A plataforma agora adota o layout de grade de forma definitiva para maximizar a visualização das artes.

### 🛠️ 12. Correção de Filtros e Esclarecimentos de Regras de Negócio
* **Filtro de Criador Tolerante a Múltiplas Siglas:** Resolvido um problema onde a seleção de um criador na Home zerava os resultados devido a problemas de formatação. O filtro do Frontend agora utiliza `.split(",")` e `.trim().toUpperCase()` para validar perfeitamente casos onde o criador tem múltiplas siglas salvas no banco (ex: "RM, RAPHAELMADUREIRA").
* **Métricas Globais Dinâmicas (Home):** O cálculo das métricas de topo (Investimento Total, Valor Bruto, etc.) foi refatorado. Ao invés de exibir métricas estáticas do servidor (que ignoravam a pessoa selecionada), o frontend agora recalcula esses números dinamicamente em tempo real sempre que o usuário altera o filtro de pessoa ou de datas, aplicando-se sobre o volume filtrado.
* **Clarificação da Página de Equipe:** Adicionados balões informativos (Tooltips) nos cards de Receita Líquida do dashboard da equipe para deixar claro que a métrica engloba o faturamento de **todos** os anúncios no mês vigente (incluindo ativos e pausados), justificando de maneira visual e simples a divergência em relação ao Dashboard inicial (que prioriza a amostragem apenas de ativos).

### 🤖 13. Dynamic AI Model Discovery e Cache
O núcleo de inteligência artificial (`lib/ai.ts`) foi refatorado para descobrir e utilizar os modelos de IA mais recentes e eficientes de forma dinâmica (Auto-Descoberta Completa).
* **Auto-Descoberta nas APIs:** Em vez de depender de nomes de modelos hardcoded (o que gerava falhas quando os provedores descontinuavam ou atualizavam modelos), o sistema agora faz uma consulta ativa às APIs do Gemini, Groq, OpenRouter, OpenAI, Anthropic, Cohere e Hugging Face buscando sempre o melhor modelo de chat disponível na conta.
* **Sistema de Cache em Memória:** Para não gerar sobrecarga de requisições e evitar Rate Limits de descoberta, os modelos resolvidos ficam salvos num cache em memória com expiração de 1 hora.
* **Maior Estabilidade:** Essa heurística garante que a geração de Insights e Hipóteses nunca pare, pois mesmo na ausência dos modelos preferenciais, o sistema fará fallback imediato para o modelo equivalente em operação, de forma invisível para o usuário.

### 🎨 14. Refinamento de UI e Filtros de Similaridade
* **Grid de Equipe (Desktop):** O layout dos cards de produtividade na aba de Equipe foi ajustado para forçar a exibição de 3 colunas (3 cards por linha) no desktop, oferecendo um respiro visual melhor.
* **Borda de Alerta de Insights:** Nos cards de Insights do Mercado, o destaque da urgência (borda colorida e reflexo) agora aparece apenas para insights que são **novos/não lidos**, limpando a interface para insights já consumidos.
* **Filtro de Anúncios Ativos na Similaridade:** A inteligência e o agrupamento cruzado da página de Similaridade agora filtram o banco de dados e processam **exclusivamente** anúncios que estejam com o status `ACTIVE` no Meta Ads, evitando análises de fadiga em peças que já foram desativadas ou pausadas.
* **Regra de Gasto Mínimo:** Implementada uma trava de validação na tela de Similaridade. O sistema agora só agrupa e analisa criativos que já consumiram **pelo menos R$ 200,00**, limpando a tela de dezenas de testes prematuros que não tiveram tração do Meta.
* **Simplificação de Nomenclaturas:** Todo o jargão técnico de tráfego pago (Entity IDs, Taxonomia, Canibalização) foi substituído por linguagem amigável ao time criativo (ex: "Concorrência Alta", "Sugou a Verba", "Conceitos Semelhantes"). O prompt da IA também foi ajustado para agir puramente como um Diretor de Arte.
* **Custom DatePicker:** O input de data nativo do navegador (no dashboard principal) foi completamente substituído por um componente de calendário exclusivo, com design Glassmorphism e tipografia moderna, melhorando a imersão e experiência visual de seleção de período.

### 👥 15. Filtro Estrito Mensal na Equipe e Dashboard Criativo
* **Contabilização de Receita e Gastos:** Os relatórios da página de Equipe foram refatorados para calcular "Receita Líquida", "Receita Bruta", "ROAS", e outras métricas financeiras **exclusivamente a partir de anúncios que foram lançados (criados) no próprio mês selecionado**. Isso limpa a performance do criador, removendo interferências de anúncios que subiram em meses anteriores mas que continuam performando e gastando verba no mês vigente.
* **Glossário Atualizado:** Textos explicativos e *tooltips* da interface da equipe foram ajustados para refletir essa nova regra de contabilização estrita.
* **Dashboard Criativo (Home):** Essa mesma regra restrita de criação no período foi expandida para a **Página Inicial**. Agora, sempre que um "Criador/Designer" específico for selecionado nos filtros do Dashboard Criativo, o sistema ocultará automaticamente os anúncios herdados de meses anteriores, exibindo apenas as peças criadas dentro do filtro de datas selecionado e recalculando o resumo de métricas do topo em conformidade com o relatório da Equipe.
* **Trava Histórica (Data de Lançamento):** Os seletores de data na aba de Equipe foram ajustados para restringir navegações a meses anteriores a **Agosto de 2026** (data de lançamento da nova metodologia de contabilização), impedindo a visualização de métricas quebradas de métodos de trabalho antigos.
* **Padronização na Similaridade:** A página de Similaridade agora utiliza, por padrão, o filtro do mês vigente (do dia 01 até o dia atual) ao carregar, garantindo que as análises de fadiga cruzada sejam feitas estritamente sobre as peças que estão rodando na safra atual.

### 🔄 16. Fallback Seguro e Reorganização do Time Interno
A infraestrutura de Roteamento de Anúncios sem atribuição foi inteiramente unificada.
* **Tolerância a Múltiplas Siglas no Fallback:** A entidade técnica usada para rotear anúncios sem designer identificado (ou influenciadores externos) foi promovida e agora possui tolerância de busca usando `.includes()` no banco de dados. Isso significa que você pode cadastrar siglas customizadas como "INFLUENCIADORES" ou "PARCERIAS" na entidade `UNKNOWN` sem quebrar o algoritmo de coleta automática do Facebook e Slack.
* **Reorganização Visual da Equipe:** O painel dinâmico da aba de Equipe agora forçará a entidade `Time Interno / Parcerias` a aparecer estritamente no final da tela, independente do seu faturamento bruto ou do número de anúncios, garantindo que o ranking visível e as primeiras posições pertençam à equipe oficial de design.
* **Bloqueio de Deleção:** Implementada trava nativa de segurança (tanto no Backend - via Prisma queries - quanto no Frontend - via botões desativados) para impedir que a entidade âncora de roteamento seja deletada ou exposta inadvertidamente às edições da interface.
* **Prevenção de Duplicatas (Cron/Slack):** A rotina de background job de puxada do Slack (`app/api/sync-slack/route.ts`) e o gerador de relatórios mensais (`app/api/reports/creators/route.ts`) foram ajustados para utilizar a heurística de `findFirst` estrita baseada em contexto (contains), impedindo a criação de registros duplicados em caso de alteração no nome/sigla visual do fallback.

### 🗄️ 17. Migração Definitiva de Banco de Dados (SQLite para MySQL)
A infraestrutura de armazenamento foi completamente alterada para suportar a nuvem da Vercel.
* **Fim do Limite Serverless (Read-Only):** O banco de dados local SQLite (`dev.db`) foi descontinuado e substituído por uma conexão remota MySQL (`provider = "mysql"`) hospedada em um servidor cPanel externo, destravando a capacidade de gravar dados de sincronização do Meta em produção.
* **Compatibilidade e Tipagem (MySQL Strict):** As propriedades de armazenamento de prompts nativos do `SystemSettings` no Prisma (`hypothesisPrompt`, `insightsPrompt`, etc.) foram recategorizadas para `@db.Text` e convertidas para opcionais (`String?`). Isso resolveu a incompatibilidade arquitetural de colunas TEXT do MySQL que não suportam a injeção de valores `DEFAULT` estáticos na criação das tabelas.
* **Persistência Viva:** Com a nova string de conexão (`DATABASE_URL`), a Vercel agora funciona puramente como computação (lambdas), delegando todo o armazenamento de longo prazo, histórico de relatórios e cache diário das campanhas com total segurança no MySQL.

### 🐛 18. Correção Crítica de Sincronização (Slack P2000)
* **Tipagem LongText em Entregas (`Delivery`):** Ao migrar para o MySQL no cPanel, a coluna `text` da tabela `Delivery` foi tipada por padrão como `VARCHAR(191)`, o que gerava um erro invisível (`P2000: value too long`) toda vez que a sincronização tentava salvar uma mensagem do Slack muito grande. O Prisma Schema foi ajustado para forçar a coluna como `@db.Text`, destravando o armazenamento de textos massivos.
* **Sincronização Profunda de Entregas Restabelecida:** Com a trava de limite de caracteres removida, o *Deep Sync* do Slack conseguiu puxar com êxito todas as peças históricas (passando de ~60 para quase 500 peças recuperadas), assegurando que os rankings de design não sofram com dados perdidos.


### 🚀 19. Monitoramento de Logs e Otimizações Críticas de Conexão (Meta & Banco de Dados)
A infraestrutura de sincronização (Deep Sync) passou por uma reestruturação profunda para impedir o esgotamento do Connection Pool do MySQL e evitar os limites da API da Meta.
* **Sistema Global de Logs (`SystemLog`):** Criado um novo modelo no banco (Prisma) e um endpoint centralizado (`/api/logs`) para capturar e persistir todos os erros silenciosos de Frontend e Backend. Os logs agora podem ser monitorados em tempo real na nova aba "Logs do Sistema", dentro de Configurações.
* **Otimização de Connection Pool (Meta Sync):** O motor de sincronização da Meta (`lib/meta-sync.ts`) foi refatorado. Anteriormente, ele despachava milhares de `Promises` brutas simultaneamente para o Prisma, causando travamentos e erros 503 (`Can't reach database server`). A lógica agora foi encapsulada em *Closures* e executada rigorosamente em blocos paralelos (*chunks*) de apenas 10 operações por vez.
* **Remoção de Rate Limit Intencional (Frontend):** Identificamos que o painel possuía um *loop* legado que forçava a busca dos últimos 6 meses simultaneamente toda vez que a "Sincronização Profunda" era acionada, causando o bloqueio fatal `Application request limit reached` por parte da Meta. O *loop* foi completamente aniquilado (`NotificationProvider.tsx`). O foco agora é 100% no mês selecionado, garantindo uma resposta segura e sem bloqueios.
* **Otimização Extrema de Slack Sync:** O algoritmo de leitura do Slack (`app/api/sync-slack/route.ts`) foi totalmente redesenhado. O motor de Expressões Regulares (`RegExp`) agora é pré-compilado na memória, e o salvamento de dezenas de mensagens no banco deixou de ser sequencial (1 a 1) para ser feito em lotes simultâneos (chunks de 20), resultando numa velocidade de processamento absurdamente mais rápida.

### 🎯 20. Refinamento de UX, Ícones e Inteligência de Métricas (Visão Global vs Visão Safra)
As regras de negócio do Dashboard Criativo foram reconstruídas para suportar duas perspectivas conflitantes (Conta Geral vs Produtividade Individual) de forma inteligente e autônoma.
* **Ícones de Alta Fidelidade (Bootstrap):** O cabeçalho (TopBar) recebeu uma atualização visual. Substituímos SVGs estáticos pelos ícones oficiais e padronizados do Bootstrap (Meta, TikTok, Google), melhorando o acabamento premium da plataforma.
* **Desacoplamento de Filtro de Banco de Dados (`/api/db-ads`):** A trava restrita de data de criação foi removida do Backend. A API voltou a fornecer de forma bruta e íntegra **todos** os anúncios que gastaram verba no mês (novos ou velhos), devolvendo o controle da lógica de agrupamento totalmente para o Frontend.
* **Toggle de Visualização Puramente Visual:** O switch "Apenas criativos lançados no mês" foi redesenhado no estilo Apple (iOS) e reposicionado ao lado dos filtros de período. Agora, ele age **estritamente como um filtro de interface (Cards)**, limpando a poluição visual da tela e exibindo apenas os criativos novos, sem corromper as métricas totalizadoras (que devem sempre refletir a verdade absoluta definida pelos outros filtros).
* **Métricas Inteligentes e Mutáveis (Global vs Safra):** O cabeçalho de "Métricas Globais" do Dashboard recebeu um algoritmo situacional:
  1. Se o filtro for **"Todos os Criadores"**, o cabeçalho soma o faturamento e gasto de **TODA a conta de anúncios**, garantindo a precisão da saúde financeira geral da empresa (incluindo anúncios herdados).
  2. Se **um designer específico** for selecionado (ex: Raphael Madureira), o cabeçalho muda sua regra matemática automaticamente. Ele descarta os anúncios velhos e passa a calcular estritamente o "Relatório de Performance de Produção" (Safra do mês), cravando os centavos exatos exibidos na página da Equipe.
* **Página de Equipe Blindada:** A rota de relatórios (`/api/reports/creators`) foi certificada para nunca flexibilizar sua regra. Ela calcula os saldos da equipe baseando-se única e exclusivamente no volume de anúncios que **nasceram (lançados)** do dia 01 até o último segundo do mês.

### ⏰ 21. Correção de Agendamento do Cron (Sincronização em Background)
* **Frequência de Gatilho do Vercel Cron:** A configuração no arquivo `vercel.json` para a rota `/api/cron/sync-meta` foi alterada de execução diária (`0 0 * * *`) para a cada 15 minutos (`*/15 * * * *`). Isso permite que a lógica interna do sistema (que respeita o intervalo configurado no painel, como a cada 120 minutos) funcione perfeitamente, garantindo que as atualizações automáticas em background ocorram ao longo de todo o dia.

### 🧠 22. Correção de Geração de Insights de Mercado (Tavily Fallback)
* **API Key de Busca:** Foi identificada uma falha onde os "Insights do Mercado" deixavam de ser gerados se a chave da API do Tavily estivesse apenas no `.env.local` e não no banco de dados (`SystemSettings`). O código das rotas `/api/insights/news/route.ts` e `/api/insights/news/cron/route.ts` foi atualizado para sempre fazer fallback para a variável de ambiente `process.env.TAVILY_API_KEY` caso falte no painel, exatamente como já era feito para as chaves da OpenAI, Gemini e Anthropic. Isso garante que a pesquisa na internet e a geração diária de insights funcionem ininterruptamente.

### 🎨 23. Refatoração do Sistema de Notificações (Toast Stack)
* **Novo Componente `<ToastStack>`:** O sistema de notificações simples (toasts) que exibia apenas um aviso por vez no topo da tela foi completamente refatorado para um sistema avançado de "Pilhas" (Stack).
* **Animações (Framer Motion):** Utilizando a biblioteca `framer-motion` (adicionada às dependências), os avisos agora se empilham no canto inferior direito (`bottom: 1.5rem, right: 1.5rem`), evitando sobreposição com o menu superior e melhorando a visibilidade.
* **Interatividade Hover:** Quando múltiplas notificações aparecem, elas se comportam como uma carteira de cartas (scale e offset em Y dinâmico). Ao passar o mouse sobre a pilha (`hover`), as notificações se expandem verticalmente (para cima), permitindo visualização de todos os avisos em tempo real e interação individual (fechamento manual), reproduzindo com precisão a experiência visual de sites de ponta.

### 🖼️ 24. Sistema de Avatares Personalizados (Untitled UI)
* **Novo Componente `<Avatar>`:** Foi criado um componente reutilizável de avatar inspirado nos princípios da `Untitled UI`, contendo fallback visual automático (iniciais do nome com background colorido e gerado via hash), bordas adaptáveis e indicador de status (Active Dot).
* **Banco de Dados Atualizado:** O modelo `Creator` no Prisma foi atualizado para suportar o campo `avatarUrl`, permitindo que os designers tenham suas fotos vinculadas aos seus perfis através das rotas de API da Equipe (`/api/creators` e `/api/reports/creators`).
* **Página de Equipe e Configurações:** A listagem de criadores agora exibe os avatares em tamanho "Large" (48px). A edição da imagem foi centralizada no **Modal de Configurações**, permitindo colar a URL da foto no mesmo local onde as metas e siglas de cada membro são gerenciadas.
* **Visão Geral (Dashboard):** Em vez de um pill global no topo da página, o componente de Avatar (tamanho `xs`) agora é renderizado individualmente dentro de cada card de criativo (`CreativeCard`), atribuindo visualmente cada anúncio ao seu respectivo designer.

### 📅 25. Unificação dos DatePickers (Tailwind)
* **Substituição de Componente (Date Range Picker):** A biblioteca `react-tailwindcss-datepicker` foi adotada para entregar a experiência definitiva de seleção de intervalo de datas (Date Range). Em vez de usar inputs separados para Data Inicial e Data Final, a plataforma agora conta com um único input elegante que expande em um calendário contínuo.
* **Estilização Dinâmica:** O `CustomDateRangePicker.tsx` agora injeta classes e variáveis CSS nativas da plataforma por cima da biblioteca para garantir o aspecto *Glassmorphism* (fundo translúcido, bordas suaves e sombras premium). O Tailwind CSS (v4) foi adequadamente configurado no `globals.css` para ler os estilos do componente.

### ⚡ 26. Motor de Cache (SWR) e Experiência "Zero Loading"
* **Cache em Memória (SWR):** O sistema de buscas nativas de Frontend foi inteiramente substituído. Criado o hook `useCacheFetch` que implementa a estratégia Stale-While-Revalidate via `sessionStorage`. 
* **Navegação Instantânea:** Ao transitar entre meses na página da Equipe ou alternar datas na área de Anúncios, se a data já foi visitada na sessão, a plataforma serve o dado da memória em *0 milissegundos*, eliminando totalmente o piscar da tela, e revalida silenciosamente o banco de dados em background.
* **Skeleton Screens:** Foram criados componentes globais de `<Skeleton />` animado (com Framer Motion). O clássico ícone de Spinner (`Loader2`) foi extinto das páginas de Dashboard, Equipe e Similaridade, adotando os blocos estruturais provisórios de alta fidelidade visual para as primeiras visitas ou loads profundos.

### ✨ 27. Animações e "Plataforma Viva"
* **Transições em Cascata (Stagger):** A plataforma adotou a renderização condicional do Framer Motion (`<AnimatePresence>`). Cards de equipe, criativos e grupos de insights agora carregam com efeito cascata (Fade Up escalonado), proporcionando o peso e o refinamento esperado em plataformas premium (estilo Apple/Vercel).
* **Números Dinâmicos (`AnimatedNumber`):** Implementado um componente isolado utilizando *Física de Molas (Springs)*. Ao invés dos números e métricas carregarem de forma chapada (estática), eles interpolam os valores rapidamente (ex: subindo de $0 até $1.5M em 1 segundo), trazendo vida ao relatório de performance visual.

### 🏆 28. Refatoração da Lógica de Promoção a Winner (Agregação por Criativo)
* **Cruze de Dados por Criativo:** A lógica de cálculo para classificar os criativos como "Winner" ou "Super Winner" na rota `/api/db-ads` foi inteiramente reescrita. Em vez de avaliar os anúncios de forma isolada por Conjunto de Anúncios (AdSet), a API agora faz um scan global na base de dados, **agrupa as métricas de todos os anúncios que compartilham o mesmo nome (adName)** e avalia o montante total.
* **Elevação Automática Independente:** Se um criativo foi validado fatiando seu investimento (ex: testado em 5 conjuntos diferentes e o somatório dos testes atingiu o teto de investimento e retorno esperado), ele agora "sobe" e é consolidado magicamente para as seções de Winners, sendo automaticamente expurgado da "Área de Testes" para evitar duplicidade.
* **Contadores de Safra Global:** O Dashboard (`CreativeView`) agora conta as listagens e renderiza numericamente a quantidade exata de criativos que "subiram" ao status de validação no cabeçalho das seções (ex: `super winners (2)`), entregando imediatamente a visão geral estratégica solicitada, sem necessidade de rolagem.

### 🐛 29. Correção da Recuperação de Mídias Expiradas e Prevenção de Timeouts
A sincronização profunda de mídias (Deep Sync) passou por uma reestruturação para garantir a recuperação de imagens da Meta que já haviam expirado (`fbcdn.net`) e corrigir falhas de timeout em ambientes serverless/dev de longa duração.
* **Filtro Incondicional de Mídias Expiradas:** O motor de extração (`lib/meta-sync.ts`) foi ajustado. Anteriormente, ele limitava a recuperação de URLs apenas aos anúncios que tivessem movimentado verba no dia da sincronização. O código agora varre *todo e qualquer anúncio* do banco de dados que apresente links temporários expirados da CDN do Facebook e os reprocessa, salvando as imagens de forma perpétua no Vercel Blob.
* **Reset Dinâmico de Wall Clock Limit:** A biblioteca de controle de taxa de requisições (`lib/throttled-fetch.ts`) calculava o tempo decorrido usando uma constante de inicialização do servidor. Isso causava falhas imediatas (`WallClockLimitError`) se o usuário clicasse em Sincronizar após 3 minutos logado. Criada a função `resetWallClock()` para isolar o tempo máximo da API (3 minutos) exclusivamente durante a requisição de Sync.

### ⚙️ 30. Armazenamento Independente de Imagens (cPanel) e UI de Configurações
* **Desacoplamento do Vercel Blob:** O sistema de Deep Sync foi reestruturado para enviar imagens estáticas da Meta diretamente para um servidor cPanel via Webhook (POST com `FormData`), removendo a dependência de serviços pagos/limitados de terceiros e aproveitando infraestrutura existente do usuário.
* **Fallback Inteligente:** O algoritmo continua mantendo a conexão com Vercel Blob como método alternativo transparente caso a hospedagem privada não esteja configurada ou caia.
* **Configurações via Dashboard:** As credenciais de upload (URL e Secret Token) foram expostas de forma segura na interface, através de uma nova seção na aba "Geral & Sistema" do `<SettingsModal>`. O banco de dados (`schema.prisma`) e a rota `/api/settings` foram migrados para armazenar esses dados na tabela `SystemSettings`, eliminando a necessidade de editar o arquivo `.env.local` manualmente.

### 🔒 31. Centralização Total de Variáveis de Ambiente no Banco de Dados
Seguindo a diretriz de eliminar a dependência de arquivos `.env.local` para gestão do sistema, as configurações de autenticação e comunicação externa foram 100% integradas à interface.
* **Refatoração do NextAuth:** O sistema de login (`app/api/auth/[...nextauth]/route.ts`) foi inteiramente refatorado para operar de forma assíncrona por requisição. Ele agora busca as credenciais do Google OAuth (`googleClientId`, `googleClientSecret`) e as chaves do sistema (`nextAuthSecret`, `nextAuthUrl`) diretamente do banco de dados na hora do login.
* **Sistema Híbrido Anti-Lockout:** Foi implementado um fallback silencioso: se o banco de dados for corrompido, zerado ou ainda não tiver as configurações cadastradas pela interface, o sistema tentará buscar as antigas variáveis do `.env` como plano de emergência, impedindo que o acesso à plataforma seja bloqueado.
* **Nova Interface de Integração:** O Modal de Configurações foi expandido na aba "Integrações (API)". Agora ele permite configurar não apenas o Access Token da Meta, mas também os campos `META_APP_ID` e `META_APP_SECRET`. Além disso, foi criada a seção "Autenticação e Google OAuth" para injetar o Client ID do login corporativo.

### 🎨 32. Ajustes de Contraste e UI (Modos Claro e Escuro)
* **Visibilidade do Botão de Sincronização:** No modo claro (Light Mode), o botão "Sincronizar" do menu superior estava com a borda e o fundo invisíveis devido ao uso de cores estáticas (`rgba(255, 255, 255, 0.1)`). Ele foi refatorado para utilizar as variáveis CSS nativas do tema (`--card-border` e `--card-bg`), garantindo contraste e um visual premium em ambos os modos.
* **Textos do Dropdown de Sincronização:** No modo escuro (Dark Mode), os textos auxiliares do menu de sincronização ("Atualiza métricas...", "Última att") estavam ilegíveis por falta da declaração correta da cor de contraste (`--muted`). A variável foi adicionada à folha de estilos global (`globals.css`) para ambos os temas, restaurando perfeitamente a legibilidade sem quebrar o design.

### 🐛 33. Correção na Renderização de Vídeos (Dashboard)
* **Prevenção de Falsos-Positivos de Imagem:** Identificamos que criativos em formato de vídeo estavam sendo renderizados como imagens estáticas na plataforma. Isso ocorreu porque o gatilho de verificação no Frontend dependia da coluna genérica `mediaType` do banco de dados (que frequentemente herda o valor padrão `"image"`). O componente (`CreativeView.tsx`) e o orquestrador de sincronização (`meta-sync.ts`) foram refatorados para garantir a presença e prioridade da propriedade `videoUrl`, restaurando imediatamente o player de vídeo nativo para todas as campanhas audiovisuais.
### 🐛 34. Correção no Armazenamento de Insights de Mercado (Prisma P2000)
* **Tipagem LongText em Insights da IA:** Identificamos que os relatórios gerados pela Inteligência Artificial na busca por novidades (Tavily) estavam sendo descartados silenciosamente no Backend. O erro ocorria porque a tabela `AlgorithmUpdate` no MySQL usava a tipagem padrão `VARCHAR(191)` para a coluna `content`, sendo insuficiente para armazenar relatórios estruturados em Markdown. O Prisma Schema foi ajustado para forçar a coluna como `@db.Text`, destravando o salvamento e a renderização correta dos insights gerados pela IA no painel.

### 🐛 35. Correção na Exibição e Sincronização de Vídeos (CreativeView)
* **Recuperação Perpétua de Vídeos Expirados:** A rotina de _Deep Sync_ () foi aprimorada. Antes, ela apenas verificava se os links de **imagens** estavam expirados (URLs  ou ). Agora, o motor também audita e flagra anúncios em que o link do **vídeo** original do Meta Ads venceu. Isso aciona a busca de um novo link temporário na API da Meta, garantindo que os vídeos voltem a rodar no painel em vez de ficarem com a tela preta.
* **Atualização em Massa de mediaType:** Durante a revisão do banco de dados, notamos que centenas de anúncios antigos em formato de vídeo estavam salvos com o  padrão (). O algoritmo de sync foi recodificado para forçar o status  caso a Meta entregue uma . Além disso, uma varredura retroativa foi aplicada no banco, corrigindo dezenas de vídeos que estavam sendo indevidamente renderizados como imagens estáticas na Home.

### 🐛 35. Correção na Exibição e Sincronização de Vídeos (CreativeView)
* **Recuperação Perpétua de Vídeos Expirados:** A rotina de _Deep Sync_ (`meta-sync.ts`) foi aprimorada. Antes, ela apenas verificava se os links de **imagens** estavam expirados (URLs `fbcdn.net` ou `scontent`). Agora, o motor também audita e flagra anúncios em que o link do **vídeo** original da Meta venceu. Isso aciona a busca de um novo link temporário na API da Meta, garantindo que os vídeos voltem a rodar no painel em vez de ficarem com a tela preta.
* **Atualização em Massa de mediaType:** Durante a revisão do banco de dados, notamos que centenas de anúncios antigos em formato de vídeo estavam salvos com o `mediaType` padrão (`image`). O algoritmo de sync foi recodificado para forçar o status `video` caso a Meta entregue uma `videoUrl`. Além disso, uma varredura retroativa foi aplicada no banco, corrigindo dezenas de vídeos que estavam sendo indevidamente renderizados como imagens estáticas na Home.

### 🐛 36. Correção na Atribuição de Autores (CreativeView)
* **Extração Automática de Autores (Designers) no Sync:** O motor de sincronização profunda (`lib/meta-sync.ts`) foi atualizado para processar automaticamente as siglas de atribuição (ex: `_RM_`) presentes nos nomes dos anúncios no momento da criação ou atualização. Antes, a atribuição dependia de um script externo manual que frequentemente falhava ou demorava muito para rodar em grande escala.
* **Reprocessamento Retroativo Rápido:** Um script otimizado (`fix-designers-fast.js`) foi executado para vasculhar o banco de dados e atribuir retroativamente os designers a mais de 120 anúncios antigos que estavam orfãos na plataforma (sem exibição de avatar no `CreativeView`), corrigindo a exibição na interface sem precisar re-sincronizar tudo com a Meta Ads.

### 🐛 37. Correção de Expressão Regular na Atribuição de Designers
* **Prevenção de Range Out of Order:** Identificamos um erro silencioso na Expressão Regular (Regex) de extração de siglas em `lib/meta-sync.ts` e `fix-designers.js`. A classe de caracteres `[_\\- ]` foi refatorada para `[-_ ]` para evitar que engines modernas do JavaScript transpilado a interpretassem acidentalmente como um range de caracteres fora de ordem (ASCII 95 a 32). Essa melhoria blinda a sincronização para que as siglas sempre sejam extraídas sem quebras no servidor.

### 🧠 38. Diagnóstico de Escala Andromeda (Scorecard de Similaridade)
* **Mudança de Paradigma na IA:** A ferramenta de Similaridade de Criativos foi completamente refatorada para operar com base no modelo de entrega da Meta (Andromeda/GEM). Ao invés de apenas focar em canibalização visual ou CTR, a IA agora diagnostica em qual barreira do leilão (Retrieval, Auction, Attention, Intent, Conversion) um anúncio falhou.
* **Métricas Financeiras no Payload:** A rota da API `/api/similaridade/analyze` foi alterada. Ela agora consolida dinamicamente as métricas individuais de cada variação (Spend, CPM, CTR, CPC, CVR e CPA) e as injeta no prompt da Inteligência Artificial junto com as imagens originais em Base64.
* **Sistema de Classificação (Scorecard):** O prompt armazenado em `SystemSettings` foi atualizado para forçar o modelo a classificar as peças em uma de 4 categorias: **Scaler**, **Niche Winner**, **Attention Winner** ou **False Positive**. O output estruturado garante que a equipe de design receba sempre a classe, o motivo real da falha (ex: "atraiu curiosos mas falhou em intenção") e uma hipótese tática clara.

### 👁️ 39. Transcrição Visual e Novas Métricas de Saturação (Andromeda V2)
* **Engenharia de Prompt (Chain of Thought):** A arquitetura do prompt da IA de Similaridade foi atualizada para exigir uma **Transcrição Visual** *antes* de emitir o diagnóstico. O modelo agora é obrigado a descrever o cenário, as cores e a presença/ausência de selos na imagem, parando de "alucinar" conclusões baseadas apenas no nome do arquivo.
* **Interpolação Imagem-Texto:** O motor de IA (`lib/ai.ts`) foi reescrito. Agora, as imagens são intercaladas com seus respectivos nomes (`[Imagem: nome_do_criativo]`) no payload enviado para Gemini, OpenAI, Claude e outros provedores, garantindo precisão matemática sobre qual arte gerou qual métrica.
* **Sincronização de Reach e Frequency:** O schema do Prisma e o motor do Meta-Sync foram expandidos para capturar as métricas `Reach` (Alcance) e `Frequency` (Frequência). Esses dados agora são repassados para a Inteligência Artificial para diagnosticar perfeitamente "Saturação de Frequência" vs "Limitação de Alcance".

### 📱 34. Estrutura Multi-Plataforma e Início da Integração TikTok Ads
A plataforma deu o primeiro passo para se tornar um hub universal de auditoria criativa. A arquitetura foi refatorada para deixar de ser exclusiva do Meta Ads e passar a suportar nativamente anúncios de múltiplas fontes.
* **Refatoração do Banco de Dados:** A tabela `AdCreative` recebeu o campo `platform`, permitindo separar e identificar os anúncios de diferentes canais. A tabela `SystemSettings` foi atualizada com as chaves de API necessárias para a conexão (`tiktokAdvertiserId`, `tiktokAppId`, `tiktokAppSecret`, `tiktokAccessToken`).
* **UI de Configurações:** As chaves de API do TikTok foram integradas à aba de "Integrações (API)" no Modal de Configurações, posicionadas ao lado do Meta.
* **Ícones de Status Dinâmicos:** O TopHeader (TopBar) passou a consultar o banco de dados dinamicamente. Os ícones do Meta e do TikTok agora acendem (ficam ativos) apenas se as respectivas chaves de API estiverem configuradas, fornecendo um feedback visual em tempo real sobre a saúde das conexões.
* **Selo Multi-Plataforma nos Criativos:** O `<CreativeView>` foi atualizado para ler o campo `platform` do banco de dados e exibir o ícone correto de onde o anúncio se originou (ex: exibindo a logo do TikTok no lugar das logos do Facebook/Instagram), unificando a leitura de métricas financeiras (ROAS, Gasto) para todas as fontes.

### 📊 33. Unificação Cross-Channel (Meta, TikTok, Google)
O painel de Dashboard Criativo agora é multicanal, entregando um ecossistema completo de publicidade.
* **Filtro de Plataformas:** Adicionado um menu "dropdown" global no cabeçalho. Por padrão (Todos os Canais), os cards de métricas (CPA, Valor Aprovado, Spend) unificam instantaneamente as matemáticas de performance de Meta e TikTok, permitindo visualizar a eficiência consolidada.
* **Isolamento de Visão:** Ao filtrar por uma rede específica (ex: TikTok Ads), todas as métricas gerais são recalculadas sob demanda pelo Frontend para exibir estritamente os resultados originados pela rede escolhida, em 0 milissegundos.
* **Resiliência do Parser de Siglas (Designers):** A rotina Regex de associação de Designers aos criativos (`lib/meta-sync.ts`) foi reescrita (`(^|[-_ ])${ac}(?:[-._ ]|\b|$)`). Agora o sistema captura com extrema fidelidade a sigla do criador (Ex: `PP`), mesmo quando ela é inserida na primeira posição do nome do arquivo (`PP_VIDEO_...`), corrigindo vazamento de histórico.

### 📷 34. Motor Definitivo de Mídias Permanentes (TikTok Ads)
* **Arquitetura de Download e Espelhamento:** A sincronização profunda (Deep Sync) do TikTok Ads foi refatorada e nivelada com a inteligência que já possuíamos para a Meta. Agora, ao identificar imagens estáticas ou thumbnails de vídeos do TikTok, o sistema baixa o buffer da imagem direto da CDN do TikTok e despacha imediatamente para o seu próprio servidor de upload (cPanel), salvando o URL definitivo no banco.
* **Prevenção de Imagens Expiradas:** A plataforma deixa de depender de links temporários oficiais do TikTok (que costumam gerar erros 403 após poucas horas) e garante longevidade total da biblioteca de mídias do dashboard.
* **Inteligência Híbrida de Vídeos:** Enquanto as thumbnails dos vídeos são salvas localmente para exibição na grade, a reprodução original das mídias em vídeo continua extraindo a URL crua (`video_url`) apontando para os datacenters do TikTok, maximizando a velocidade sem comprometer o seu servidor de hospedagem.
