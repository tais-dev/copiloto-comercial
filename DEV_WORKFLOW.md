# DEV_WORKFLOW — Pedro Copiloto

Este arquivo define como o assistente (Claude) deve trabalhar neste repositório para entregar rápido sem quebrar o sistema.

---

## 1) Regra de ouro: um passo por vez
- Sempre proponha APENAS o próximo passo.
- Pare e espere o usuário dizer "ok", "feito", "pode ir" antes de seguir.

---

## 2) Antes de codar: confirmar contexto
Sempre começar verificando:
- Qual arquivo será alterado?
- Qual comportamento atual precisa ser preservado?
- Qual o objetivo exato da mudança?
- Existe risco de regressão? Se sim, propor alternativa mais segura.

---

## 3) Formato obrigatório de resposta quando envolver código

### 3.1 Plano curto (máximo 5 linhas)
- O que vai mudar
- Por quê
- Onde (arquivos)
- Como testar
- Risco principal

### 3.2 Checklist de implementação
- [ ] item 1
- [ ] item 2
- [ ] item 3

### 3.3 Código
- Fornecer o arquivo completo atualizado (não só trecho), a menos que o usuário peça diferente.
- Adicionar comentários para Ctrl+F, por exemplo:
  // ====== PRODUCT SEARCH ======
  // ====== SEARCH QUERY (SUPABASE) ======
  // ====== UI: MOBILE CONTRAST ======
  // ====== IMPORT (CSV -> STAGING -> UPSERT) ======
  // ====== CLIENTS (CRUD) ======
  // ====== ORDERS + INSTALLMENTS ======
  // ====== COMMISSION RECONCILIATION ======

### 3.4 Como testar (sempre)
- Passos claros de teste manual
- Se aplicável, comandos:
  - npm run dev
  - npm run build

### 3.5 Saída final
- Resumir o que foi alterado
- Listar possíveis efeitos colaterais
- Sugerir commit message

---

## 4) Padrões de engenharia (qualidade)
- Não inventar colunas/tabelas: usar supabase/schema.csv como fonte de verdade.
- Mudanças pequenas e seguras são preferidas.
- Evitar refatorações grandes sem pedido explícito.
- Mobile-first: contraste, legibilidade e botões grandes.
- Preferir performance na busca (debounce, limite, paginação, índices quando necessário).

---

## 5) Convenções do projeto (UX do Pedro)
Usuário final: Pedro, 63 anos.

Prioridades de UX:
- Menos cliques
- Campos grandes
- Cores com contraste forte (especialmente no celular)
- Feedback claro (erro/sucesso)
- Botão "copiar resposta" sempre fácil de achar

---

## 6) Convenções de Git (sugestão)
Exemplos de commit messages:
- "Improve product search: multi-keyword and ranking"
- "UI: increase mobile contrast on results"
- "Fix import upsert conflict handling"
- "Add customers CRUD table and basic UI"