-- Estado «Pendiente de envío»: con envío, entre preparando y enviado (ahí se elige la paquetería o entrega propia).
ALTER TYPE "EstadoPedido" ADD VALUE 'pendiente_envio' AFTER 'preparando';
