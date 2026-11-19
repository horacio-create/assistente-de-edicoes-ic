# Capturar para o Cartelas

## Instalar uma vez no Chrome

1. Se recebeu um ZIP, extraia primeiro. Preserve a pasta extraída nesse local.
2. Abra `chrome://extensions` no Chrome.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e escolha a pasta **extensao-cartelas**, a que contém `manifest.json`.
5. No menu de extensões do Chrome, fixe **Capturar para o Cartelas** na barra.

A instalação não acontece no navegador interno do Codex. A extensão solicita captura e rolagem da aba acionada por você, armazenamento próprio e comunicação com o Cartelas em 127.0.0.1. Não usa API da Meta, cookies ou senha do Instagram.

## Conectar ao sistema

1. Abra o Cartelas normalmente pelo `Iniciar.cmd` do projeto.
2. Entre em **Clientes → Identidade pelo feed ou por prints → Capturas do navegador**.
3. Clique em **Gerar código de conexão**.
4. Abra a extensão e cole o código em **Código de conexão**. Clique em **Conectar extensão**.
5. Se a porta do sistema for diferente de 3210, abra **Endereço do sistema** na extensão e informe a porta mostrada no Cartelas antes de conectar.

O código vale por cinco minutos e só pode ser usado uma vez. A conexão fica salva neste computador e nesse navegador. Para removê-la, use **Instalar a extensão e gerenciar conexões** no Cartelas. Não copie a pasta privada `.capture` para outro computador.

## Usar com cada cliente

1. Abra o perfil do cliente no Instagram pelo Chrome. Entre normalmente no Instagram se ele pedir.
2. Clique no ícone da extensão, escolha quantas telas quer (3 é um bom começo) e clique em **Capturar perfil automaticamente**.
3. Não mexa na aba enquanto a extensão trabalha: ela volta ao topo, captura o cabeçalho (com a foto de perfil), rola o feed sozinha e recorta só a grade de posts nas telas seguintes. Ao terminar, volta ao topo.
4. Com **Enviar ao Cartelas ao terminar** marcado, o lote segue direto para o sistema. Desmarcado, confira as miniaturas, use **Remover** se precisar e clique em **Enviar lote ao Cartelas**.
5. No Cartelas, deixe aberto o cadastro do cliente (painel **Identidade do cliente**). As capturas entram sozinhas, os posts são separados e a paleta é proposta. Confira e clique em **Aplicar e salvar cliente**.
6. Se o cadastro aberto for de outro perfil, o lote fica em **Ajustes finos → Capturas do navegador** para importar manualmente.

A captura para sozinha se o Instagram pedir login, se o perfil for privado, se o feed acabar ou se você trocar de aba. **Capturar só esta tela** continua disponível para capturar manualmente uma tela específica.

Até 12 capturas e 6 MB por lote. Enquanto não forem enviadas, as capturas ficam na memória da extensão e desaparecem ao fechar o navegador. No servidor, há até três lotes temporários, válidos por uma hora; reiniciar o servidor remove lotes pendentes. Depois de importar, analise antes de recarregar a página. Salvar cliente preserva a identidade aprovada, não os prints originais.

## Atualizar a extensão

Depois de atualizar o projeto, abra `chrome://extensions` e clique no ícone de recarregar do cartão **Capturar para o Cartelas**. A versão 1.1 pede a permissão extra **scripting**, usada só para rolar e medir a aba do perfil depois do seu clique.

## Primeiro teste

Capture duas telas diferentes de um perfil e confira se as duas miniaturas chegam ao Cartelas. A transferência, revisão e análise foram testadas em ambiente isolado com as APIs do Chrome simuladas. A captura nativa precisa ser validada nesta primeira instalação. Se houver erro, confira se o sistema está aberto, se a porta está correta e se o navegador permitiu o acesso local.

A extensão só começa depois do seu clique, na aba aberta. Ela rola o perfil, mas não abre posts, não navega para outras páginas e não lê senhas ou cookies.
