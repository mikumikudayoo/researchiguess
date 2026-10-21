import { startServer } from './src/server';
import { identityExample, validateConfig } from './src/control/controller';
if (import.meta.main) {
  const config: unknown = process.env.TAPH_CONFIG ? await Bun.file(process.env.TAPH_CONFIG).json() : identityExample;
  validateConfig(config);
  const server = startServer(config);
  console.log(`TAPH fixed-rule server: ${server.url}; mapping=${config.mapping.calibrationStatus}; hardware requires separate reviewed configuration`);
}
