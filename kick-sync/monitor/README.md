# Picos do chat do Abisal

Coletor local para recuperar o histórico recente dos canais de `site/eventos/abisal.json` e continuar buscando mensagens novas. Reutiliza o leitor de chat do app. Não abre players, não chama IA e não publica em redes sociais.

```powershell
node monitor/rodar.mjs --saida C:/caminho/monitor-abisal --historico-horas 5 --intervalo-segundos 300 --max-horas 8
```

A pasta de saída contém o histórico local por canal, cobertura, fila de candidatos e `estado.json`. Deve ficar fora da publicação e do Git. Para retomar, use a mesma pasta; mensagens são deduplicadas e os intervalos incompletos continuam pendentes. Uma trava por PID impede dois coletores na mesma pasta.

- `--uma-rodada`: coleta uma rodada e encerra.
- `--canais tanizen,geitta`: limita a canais do elenco.
- `--paginas 12`: limite por intervalo e canal em uma rodada. Cada canal recebe uma vez antes da próxima rodada; mensagens novas têm prioridade sobre o histórico pendente.
- `--pedido-ms 500`: espaçamento global entre pedidos, além do limite de quatro canais em paralelo. HTTP429 pausa a coleta por pelo menos60segundos e respeita `Retry-After` maior.

O intervalo de cinco minutos é a frequência desejada. Se a rodada ou a espera imposta pela Kick demorar mais, não começa outra em paralelo. Não garante recuperar cinco horas de todos os canais em cinco minutos. Histórico indisponível ou incompleto nunca é considerado silêncio.

O detector compara blocos de30segundos com os20minutos anteriores do próprio canal, usando mediana e desvio absoluto mediano. Exige ao menos quatro minutos de histórico coberto e participação de pessoas diferentes. Ignora comandos iniciados por `!` e limita a contribuição de cada autor a duas mensagens por bloco. Os limites são heurísticos, ainda sem calibração de precisão.

`acima` e `muito-acima` indicam atividade do chat. Despedidas, raids, músicas e outros assuntos também causam picos. `vezes` usa um piso de uma mensagem na divisão: quando `normal` é zero, não é uma multiplicação de uma média medida. Canais próximos no tempo são pistas; não identificam vítima ou adversário. Todos os candidatos começam com `revisado:false` e exigem conferência do vídeo e da fala.

Este coletor depende do PC ligado e da API pública de histórico da Kick, que pode mudar ou limitar pedidos. Não é o antigo assistente remoto nem uma automação do chat do Codex.
