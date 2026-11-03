import { createApp } from './app.ts';
import type { Env } from './env.ts';

const app = createApp({ fetch: (input, init) => fetch(input, init), now: () => Date.now() });

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
