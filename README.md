# Integração Receita Federal CBS + Supabase

## 1. Descrição do projeto

Sistema de integração entre a API da Receita Federal (CBS) e o banco de dados Supabase, desenvolvido em Google Apps Script.

O objetivo é automatizar consultas, processamento e armazenamento de informações relativas à Contribuição sobre Bens e Serviços (CBS).

## 2. Funcionalidades

O sistema contempla:

- Consulta automática de débitos CBS.
- Consulta automática de créditos CBS.
- Consulta de pagamentos (PCONT e RAD).
- Autenticação na API da Receita Federal.
- Gestão automática de tokens de acesso.
- Processamento de solicitações por ticket.
- Download dos resultados disponibilizados pela Receita.
- Gravação dos dados no Supabase.
- Atualização de registros por UPSERT.
- Processamento em lotes de até 300 registros.
- Histórico de consultas e importações.
- Controle de duplicidade de registros.
- Acionadores para execução automática.

## 3. Arquitetura

**Fluxo de integração:**

Google Apps Script → API Receita Federal → Processamento CBS → Supabase.

## 4. Tabelas utilizadas no Supabase

O sistema utiliza as seguintes tabelas:

- `debitos_cbs`
- `creditos_cbs`
- `pagamentos_cbs`
- `consultas_cbs`
- `historico_importacoes`

## 5. Configuração

No Google Apps Script, configurar as seguintes propriedades em Propriedades do Script:

| Propriedade | Descrição |
|---|---|
| SUPABASE_URL | URL do projeto Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Chave de serviço do Supabase |
| CLIENT_ID | Identificador da aplicação Receita Federal |
| CLIENT_SECRET | Segredo da aplicação |
| CNPJ_BASE | Oito primeiros algarismos do CNPJ |

**Segurança:** nunca publicar credenciais, tokens ou chaves de acesso no GitHub.

## 6. Automatizações

O sistema possui dois acionadores principais:

- Abertura diária das consultas às 07:00.
- Processamento e verificação de tickets a cada 15 minutos.

## 7. Funções principais

| Função | Finalidade |
|---|---|
| `abrirConsultasSupabaseCBS()` | Abre as consultas diárias |
| `processarConsultasSupabaseCBS()` | Processa consultas pendentes |
| `gravarDebitosNoSupabase()` | Grava débitos |
| `gravarCreditosNoSupabase()` | Grava créditos |
| `gravarPagamentosNoSupabase()` | Grava pagamentos |
| `instalarAutomacaoSupabaseCBS()` | Instala os acionadores |
| `testarConexaoSupabase()` | Testa a ligação ao Supabase |
| `listarAcionadoresCBS()` | Lista os acionadores instalados |

## 8. Tecnologias utilizadas

- Google Apps Script
- JavaScript
- API Receita Federal
- Supabase
- PostgreSQL
- REST API
- JSON

## 9. Observações

Este projeto foi desenvolvido para integração e automatização do processamento de informações da CBS.

A execução depende das credenciais, permissões, estrutura das tabelas e disponibilidade das APIs utilizadas.

---

**Projeto:** Integração CBS - Receita Federal / Supabase  
**Repositório:** integracao-cbs-supabase  
**Linguagem:** JavaScript (Google Apps Script)
