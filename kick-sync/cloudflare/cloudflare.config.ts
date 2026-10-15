import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "rust-kick-clips",
		compatibilityDate: "2026-10-15",
		compatibilityFlags: ["nodejs_compat"],
		workersDev: true,
		observability: {
			enabled: true,
			redactQueryString: true,
			logs: { enabled: true, headSamplingRate: 0.01 },
			traces: { enabled: true, headSamplingRate: 0.01 },
		},
		// Só /api/* e /health passam pelo Worker primeiro; o resto vai direto para os assets do Vite (public/).
		assets: { runWorkerFirst: ["/api/*", "/health"] },
		entrypoint,
		env: {
			DB: bindings.d1({ name: "rust-kick-contexto", id: "ad80b585-35a6-42c0-82a8-9b38da98cb8f" }),
			ASSETS: bindings.assets(),
			ANTHROPIC_API_KEY: bindings.secret(),
			CONTEXTO_ATIVO: bindings.text("1"),
			CONTEXTO_ORCAMENTO_MENSAL_USD: bindings.text("0.50"),
			CONTEXTO_LIMITE_CHAMADAS_DIA: bindings.text("40"),
			CONTEXTO_LIMITE_CANDIDATOS_LIVE: bindings.text("20"),
		},
	},
});
