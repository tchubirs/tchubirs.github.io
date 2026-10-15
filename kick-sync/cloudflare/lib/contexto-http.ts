// Pure, Web-standard Request helpers for the API route: the strict same-origin check and the
// streaming 6MB body cap. Framework-independent (no Next.js/Workers imports) so they can be unit
// tested directly with a plain `Request`/`ReadableStream`.
export const MAX_CORPO_BYTES = 6 * 1024 * 1024;

/** Never trusts a client-supplied X-header for this: only the browser-set `Origin` (when
 * present) or `Sec-Fetch-Site` decide same-origin. */
export function mesmaOrigem(request: Request): boolean {
  const origin = request.headers.get("origin");
  const own = new URL(request.url).origin;
  if (origin) return origin === own;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

/** Reads the body as a stream, rejecting before `JSON.parse` once the cap is exceeded — a
 * misreported or absent Content-Length never bypasses the real byte cap. */
export async function lerCorpoLimitado(
  request: Request,
  limiteBytes: number = MAX_CORPO_BYTES,
): Promise<{ texto: string } | { excedeu: true }> {
  const declarado = request.headers.get("content-length");
  if (declarado && Number(declarado) > limiteBytes) return { excedeu: true };
  if (!request.body) return { texto: "" };
  const reader = request.body.getReader();
  // TextDecoder com stream: um caractere UTF-8 (ex.: "ç", "ã") pode vir partido entre dois chunks.
  const decoder = new TextDecoder("utf-8");
  let texto = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limiteBytes) {
      await reader.cancel().catch(() => {});
      return { excedeu: true };
    }
    texto += decoder.decode(value, { stream: true });
  }
  texto += decoder.decode();
  return { texto };
}
