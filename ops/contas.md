# Operação de contas

## Pedidos de exclusão

1. Consulte a fila `account_deletion_requests` pelo banco de administração, via SSH. Use o ID imutável da solicitação. A fila registra data e titular, e somente o titular autenticado pode registrar a solicitação pela aplicação.
2. Confirme o escopo com o titular por um canal já verificado. Registre autorização, operador, data e escopo no controle de acesso administrativo. Trate separadamente a transferência da conta criadora quando `app_state.creator_id` corresponde ao pedido.
3. Inventarie pelo ID as relações de amizade, o acervo e as mídias de `media_files.owner_id`. Confira referências cruzadas e registros antigos sem titular. Para cada arquivo, valide o caminho real abaixo do diretório de mídia e sua atribuição no banco. Mídias ambíguas exigem revisão de origem.
4. Antes da execução autorizada, gere um backup protegido e verifique a restauração numa cópia isolada. Ensaie a operação na cópia. Registre os vínculos que devem desaparecer e as contagens das demais contas.
5. Durante o corte autorizado, interrompa gravações, verifique novamente a solicitação e mova apenas os arquivos confirmados para quarentena restrita. Em uma transação, remova sessões, vínculos de amizade, cadastro, credenciais e registros de mídia do titular. Remova a conta por último para que as chaves estrangeiras removam os registros dependentes. Em caso de falha, reverta a transação e recoloque os arquivos confirmados. Verifique que as demais contas e mídias continuam acessíveis.
6. Registre a conclusão operacional e controle os prazos de quarentena e retenção com o responsável pelo serviço. Antes de restaurar qualquer geração anterior, reaplique as exclusões já concluídas na cópia isolada. Inclua dumps, diretórios históricos e mídias nas revisões de retenção. O timer de backup é uma camada operacional, com janela de 30 dias para as cópias diárias. Cópias manuais precisam de inventário e prazo próprios.

Este procedimento orienta o operador. A fila não inicia exclusão automática.

## Preparar envio de recuperação

1. Verifique um domínio de envio no Resend e escolha um remetente desse domínio.
2. Guarde `RESEND_API_KEY` e `WELCOME_FROM_EMAIL` em um arquivo de ambiente legível apenas pelo administrador. Defina `PASSWORD_RESET_ORIGIN=https://147-15-126-191.sslip.io` no mesmo ambiente.
3. Referencie esse arquivo com `EnvironmentFile=` no drop-in systemd de `minhaestante`. Valide o arquivo e reinicie o serviço. Confira que `GET /api/auth/password-reset` responde com o sinalizador de disponibilidade.
4. Valide o primeiro envio real com uma caixa de testes autorizada, após configurar o remetente. O link deve expirar em 30 minutos e ser aceito uma vez. Confira que a senha foi trocada e que as sessões antigas perderam acesso.
5. Em caso de erro, inspecione o evento `password_reset_delivery_failed` pelo ID de requisição. Preserve chaves, tokens e endereços de conta fora dos logs.

A produção ainda precisa de uma chave Resend e de um remetente verificado. Nenhum envio foi simulado.
