# Disparador Açaíteria - Telegram Bulk Sender

Sistema web para gerenciamento de contatos e envio de mensagens em massa via Telegram, utilizando a API oficial (MTProto/GramJS). Desenvolvido para facilitar campanhas de marketing, permitindo envio de textos e imagens para listas de contatos ou base de dados interna.

## 🚀 Funcionalidades

-   **Envio em Massa:** Dispare mensagens para listas importadas (CSV) ou contatos salvos no banco.
-   **Suporte a Imagens:** Envie imagens via upload ou reutilize imagens salvas na **Galeria**.
-   **Gerenciamento de Contatos:**
    -   Importação automática dos contatos do Telegram.
    -   Cadastro manual.
    -   Filtros inteligentes (ex: contatos que não recebem mensagens há X dias).
-   **Templates:** Crie e salve modelos de mensagens para reutilização.
-   **Logs Detalhados:** Acompanhamento em tempo real via interface e histórico salvo no banco de dados.
-   **Conexão Persistente:** Login via QR Code/Código (MTProto) com sessão salva no banco.

## 🛠️ Tecnologias Utilizadas

-   **Backend:** Node.js, Express, Socket.io
-   **Banco de Dados:** PostgreSQL
-   **Telegram Client:** GramJS (MTProto)
-   **Frontend:** HTML5, Bootstrap 5, JavaScript (Vanilla)

## 📋 Pré-requisitos

1.  **Node.js** (versão 14 ou superior) instalado.
2.  **PostgreSQL** instalado e rodando.
3.  Credenciais de API do Telegram (`API_ID` e `API_HASH`). Obtenha em my.telegram.org.

## ⚙️ Instalação e Configuração

### 🐧 Linux (Debian/Ubuntu)
Se estiver utilizando uma distribuição baseada em Debian, instale os pré-requisitos com:
```bash
sudo apt update
sudo apt install nodejs npm postgresql postgresql-contrib git -y
```

1.  **Clone ou baixe o projeto** para uma pasta local.

2.  **Instale as dependências:**
    Abra o terminal na pasta do projeto e execute:
    ```bash
    npm install
    ```

3.  **Configuração do Banco de Dados:**
    -   Crie um banco de dados no PostgreSQL (ex: `frazaoAcaiteria`).
    -   As tabelas serão criadas automaticamente na primeira execução, mas você pode consultar o arquivo `database.sql` para ver a estrutura.

4.  **Configuração de Ambiente (.env):**
    Crie um arquivo `.env` na raiz do projeto e preencha com suas informações (ou configure via interface web na primeira execução):
    ```env
    TELEGRAM_API_ID=seu_api_id
    TELEGRAM_API_HASH=seu_api_hash
    DATABASE_URL=postgres://usuario:senha@localhost:5432/nome_do_banco
    ```

## ▶️ Como Rodar

### Opção 1: Via Script (Windows)
Dê um duplo clique no arquivo `iniciar_sistema.bat`. Ele abrirá o servidor e o navegador automaticamente.

### Opção 2: Via Terminal
Execute o comando:
```bash
node server.js
```
Acesse no navegador: `http://localhost:3000`

## 📖 Guia de Uso

1.  **Conexão:** Vá até a aba **Conexão**, clique em "Iniciar Conexão" e siga os passos (Telefone -> Código -> Senha 2FA se houver).
2.  **Contatos:** Na aba **Contatos**, você pode adicionar manualmente ou clicar em "Importar do Telegram" para puxar sua agenda.
3.  **Templates:** Cadastre mensagens padrão na aba **Templates**.
4.  **Enviar:**
    -   Escolha a fonte (CSV, Todos do Banco ou Filtro).
    -   Escreva a mensagem ou escolha um template.
    -   (Opcional) Selecione uma imagem do computador ou da **Galeria**.
    -   Defina o delay (tempo entre mensagens para evitar bloqueios).
    -   Clique em **INICIAR DISPAROS**.

## ⚠️ Aviso Legal

Este software utiliza a API do Telegram (MTProto). O uso excessivo ou envio de spam pode resultar no banimento da sua conta pelo Telegram. Use com responsabilidade e respeite os limites da plataforma.