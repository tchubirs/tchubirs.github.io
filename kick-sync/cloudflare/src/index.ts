// Worker fino: toda a lógica HTTP fica em handler.ts (testável por injeção do core).
import { criarWorker } from "./handler.ts";

export default criarWorker();
