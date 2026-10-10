# Povix

## Política de utilização do OpenAI Codex

O projeto tem acesso ao OpenAI Codex através da skill-codex. O Claude Code é o programador principal e responsável pelas decisões finais. O Codex é um revisor e consultor independente, utilizado seletivamente para aumentar a qualidade do trabalho.

### Princípio fundamental

Não invoques o Codex por rotina, por hábito ou apenas porque está disponível. A maioria das tarefas deve ser resolvida diretamente pelo Claude Code.

Utiliza o Codex quando o seu contributo independente tiver uma probabilidade real de melhorar a qualidade, a segurança ou a fiabilidade da solução.

### Quando NÃO utilizar o Codex

Resolve estas tarefas sozinho, sem pedir uma segunda opinião:

- Alterações pequenas de CSS, cores, margens, espaçamentos ou tipografia.
- Corrigir textos, labels, traduções e erros ortográficos.
- Ajustar um botão ou um componente simples.
- Alterações localizadas, claras e de baixo risco.
- Ler código, explicar funcionalidades ou responder a dúvidas simples.
- Pequenas correções cujo comportamento é evidente e pode ser verificado diretamente.
- Pequenos ajustes de documentação ou formatação.

Não invoques o Codex repetidamente para confirmar decisões simples, rever cada ficheiro ou avaliar cada pequena correção.

### Quando utilizar o Codex

Considera consultar o Codex nos seguintes casos:

1. Refatorações importantes que envolvam vários módulos ou alterem a arquitetura.
2. Alterações significativas na sincronização de vídeos, reprodução, linha do tempo, eventos ou gestão de estado.
3. Problemas difíceis de diagnosticar, intermitentes ou ainda sem causa identificada.
4. Potenciais problemas de segurança, concorrência, desempenho, integridade dos dados ou compatibilidade.
5. Decisões arquiteturais com várias soluções plausíveis e consequências importantes.
6. Alterações extensas ou de risco elevado, especialmente quando possam afetar funcionalidades existentes.
7. Revisão final de uma funcionalidade importante, antes de a considerar concluída.

O tamanho da alteração é apenas um indicador. Considera também a complexidade e o risco: uma pequena alteração em código crítico pode justificar uma revisão independente.

### Como utilizar o Codex

- Prefere uma única consulta bem delimitada em vez de várias chamadas fragmentadas.
- Para revisões, pede ao Codex que examine as alterações relevantes e procure erros concretos, regressões, problemas de arquitetura e casos não cobertos pelos testes.
- Para decisões importantes, pede uma segunda opinião objetiva sobre os riscos e as alternativas.
- Não delegues a implementação ao Codex por defeito. Utiliza `/codex-do` apenas quando a delegação oferecer uma vantagem clara ou quando o dono a solicitar explicitamente.
- Não executes `/codex-review` depois de cada pequena alteração.
- Faz uma segunda revisão apenas quando a primeira identificar problemas importantes, as correções forem substanciais ou persistir uma dúvida relevante.
- Não repitas consultas sem uma pergunta nova ou uma alteração material no código.

### Critérios antes de cada consulta

Antes de invocar o Codex, avalia internamente:

1. A tarefa tem complexidade ou risco suficientes?
2. Uma segunda perspetiva poderá encontrar problemas que uma revisão normal não detetaria?
3. Existe uma pergunta concreta que justifique o custo e o tempo da consulta?

Se a resposta for negativa, trabalha sozinho. Se a resposta for positiva, utiliza a ferramenta apropriada e fornece apenas o contexto necessário.

Se houver dúvida genuína sobre a necessidade de consultar o Codex, prefere continuar autonomamente nas tarefas de baixo risco. Para alterações de risco elevado, informa o dono brevemente do motivo da revisão.

### Autoridade e responsabilidade

O Codex é um consultor independente, não uma autoridade infalível.

Avalia criticamente as suas conclusões, confirma os problemas no código real e distingue erros comprovados de hipóteses. Não aceites nem rejeites uma recomendação apenas por ter sido apresentada pelo Codex.

Mantém a responsabilidade pela implementação, pela coerência da arquitetura e pela verificação final.

### Objetivo

Maximizar a qualidade do projeto com o mínimo de consultas desnecessárias: Claude Code implementa, testa e resolve as tarefas normais; Codex contribui quando uma segunda perspetiva acrescenta valor real.

Não sacrifiques qualidade em funcionalidades críticas para poupar consultas, mas também não transformes a colaboração entre modelos num ritual obrigatório.
