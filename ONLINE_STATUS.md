# Estado da aplicação — 28-10-2026

- Projeto: ozvfedllkbzhdgznwvpu. Catálogo com 16 serviços e agenda no fuso Europe/Lisbon.
- A migração de marcações manuais está instalada. Teste transacional no PostgreSQL passou: acesso apenas de staff, criação confirmada, horário reservado e libertado ao cancelar, sem notificação manual. Todos os dados de teste foram revertidos.
- O email administrativo já está na lista privada; o acesso exige confirmação do endereço. Ainda não existe utilizador autenticado nem telemóvel inscrito.
- Envio automático instalado: evento de pedido → pg_net → função notify; novas tentativas a cada 2 minutos para pedidos pendentes com menos de 24 horas e marcação futura, quando houver telemóvel inscrito.
- Autenticação própria: segredo gerado e guardado no Vault, validado por RPC executável apenas por service_role. verify_jwt=false permite o webhook usar esta autenticação; não permite envio anónimo.
- Uma reserva atómica por evento evita processamento simultâneo. Recibos por dispositivo evitam reenviar para dispositivos que já receberam nas tentativas anteriores. Existe uma pequena janela entre a aceitação pelo serviço push e a gravação do recibo, por isso não há garantia de entrega exatamente uma vez.
- VAPID configurado no Supabase. Nenhum segredo está no repositório. O antigo NOTIFY_WEBHOOK_SECRET não é usado pela nova implementação.
- Teste de transporte real: chamada autenticada para evento inexistente devolveu 404 Not found, confirmando a ligação e autenticação. Teste sem credencial/inválida: 401.
- Teste de interface existente passou com Node: catálogo, respostas fora de ordem, submissão dupla, sucesso e erros com preservação de dados.
- Por concluir no dispositivo: a Ana abre admin.html, entra pelo email, instala no ecrã principal se necessário e ativa notificações. Depois criar pedido de teste real para validar receção.
- O fornecedor de email transacional próprio ainda precisa de ser confirmado/configurado antes de disponibilizar a app a clientes externos; o serviço de email padrão do Supabase pode limitar destinatários.
