import { commandForFlow, identityExample, validateConfig, type ControllerConfig } from './control/controller';
const decimal = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
export function handleRequest(request: Request, config: ControllerConfig = identityExample): Response {
  if (request.method !== 'GET') return Response.json({error:'GET required'}, {status:405});
  const url = new URL(request.url);
  if (url.pathname.startsWith('/a/')) return Response.json({error:'legacy route retired; use explicit v1 protocol'}, {status:410});
  if (url.pathname !== '/v1/command') return Response.json({error:'not found'}, {status:404});
  const q = url.searchParams.get('flowLMin'); const seq = url.searchParams.get('sequence');
  if (url.searchParams.getAll('flowLMin').length !== 1 || url.searchParams.getAll('sequence').length !== 1 ||
      [...url.searchParams.keys()].some(k => k !== 'flowLMin' && k !== 'sequence') ||
      q === null || seq === null || !decimal.test(q) || !/^(?:0|[1-9]\d*)$/.test(seq) || !Number.isFinite(Number(q)) ||
      !Number.isSafeInteger(Number(seq)) || Number(seq)>0xffffffff)
    return Response.json({error:'strict finite decimal flow and uint32 sequence required'}, {status:400});
  try { return Response.json(commandForFlow(Number(q),Number(seq),config), {headers:{'Cache-Control':'no-store'}}); }
  catch (error) { return Response.json({error:error instanceof Error ? error.message : 'invalid command'}, {status:error instanceof RangeError?422:400}); }
}
export function startServer(config: ControllerConfig = identityExample) {
  validateConfig(config);
  const port = Number(process.env.TAPH_PORT ?? 3000);
  if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('invalid TAPH_PORT');
  return Bun.serve({hostname:process.env.TAPH_HOST ?? '127.0.0.1',port,fetch:r=>handleRequest(r,config)});
}
