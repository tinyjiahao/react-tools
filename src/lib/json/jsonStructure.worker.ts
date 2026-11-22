import { parseJsonStructure } from './jsonStructure';
self.onmessage = (event: MessageEvent<{ version: number; text: string }>) => {
  try { self.postMessage({ version: event.data.version, ...parseJsonStructure(event.data.text) }); }
  catch { self.postMessage({ version: event.data.version, nodes: [], incomplete: true }); }
};
