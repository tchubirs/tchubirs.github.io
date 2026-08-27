#!/usr/bin/env node
'use strict';
const { criar } = require('./servidor');

const PORTA = Number(process.env.PORTA || 8790);
const { servidor } = criar({ caminhoBanco: process.env.BANCO || 'detetive.db' });

servidor.listen(PORTA, () => {
  console.log(`Detetive no ar em http://127.0.0.1:${PORTA}`);
  console.log(`  webhook da Kick : POST /webhook/kick/<canal>`);
  console.log(`  lista do agente : POST /api/servidor`);
  console.log(`  alertas         : GET  /api/alertas?canal=<canal>`);
  console.log(`  consulta        : GET  /api/consultar?canal=<canal>&nome=<nome>`);
});

// Encerra limpo: sem isto o SQLite pode ficar com o WAL pela metade.
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => { servidor.close(() => process.exit(0)); });
}
