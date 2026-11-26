import { embeddedCandidates } from './embeddedJson';
self.onmessage = (event: MessageEvent<{ version: number; text: string }>) => {
  try { self.postMessage({ version: event.data.version, candidates: embeddedCandidates(event.data.text) }); }
  catch (error) { self.postMessage({ version: event.data.version, candidates: [], error: (error as Error).message }); }
};
