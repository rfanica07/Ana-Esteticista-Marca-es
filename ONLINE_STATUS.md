# Endereço de produção — 22-11-2026

- Convite para instalar a app: ao guardar uma marcação com um telefone novo, a área da Ana apresenta uma mensagem personalizada com o link público e os passos para iPhone/Android. Também pode abrir ou copiar o convite em Contactos das clientes. O envio no WhatsApp é manual.
- Cabeçalho público: Luisa & Ana, com monograma L&A, Instagram @luisiana_cabeleireiro_estetica, acesso às marcações e partilha do link. Paleta original preservada (creme #fffaf4, rosa #ba7184 e texto #443337).
- Aviso de follow-up ativo no Supabase: `ana-follow-up-notice` verifica o horário de Lisboa e cria um único evento às 13:30, exceto terça e sábado, apenas havendo marcações confirmadas para amanhã. A notificação abre a agenda do dia seguinte. Não envia mensagens de WhatsApp automaticamente. Testes locais (12) e testes transacionais de horário, folgas e idempotência aprovados.
- App pública: https://ana-esteticista.pages.dev/
- Área da Ana: https://ana-esteticista.pages.dev/admin
- Alojamento: Cloudflare Pages, projeto ana-esteticista, publicação por Direct Upload. As alterações no GitHub não atualizam este alojamento automaticamente: é obrigatório preparar e enviar novamente os ficheiros públicos.
- Pacote publicado e registo da publicação: ../output/ana-esteticista-cloudflare.zip e ../output/ana-esteticista-cloudflare-state.json. O pacote contém apenas 14 ficheiros web; não inclui SQL, testes, contactos nem credenciais privadas.
- Mantém a mesma base Supabase; login da Ana, catálogo e horários verificados no novo endereço. Site URL e retornos de autenticação atualizados, com os endereços antigos preservados.
- Quem instalar a app pelo novo endereço precisa de entrar novamente e ativar as notificações nesse dispositivo. As subscrições do endereço anterior não migram entre origens.

---

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

