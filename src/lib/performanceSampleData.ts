export interface PerformanceEvent {
  name: string;
  start: number;
  duration: number;
  category?: string;
  details?: Record<string, any>;
}

export interface PerformanceData {
  title?: string;
  events: PerformanceEvent[];
  startTime?: number;
}

const SAMPLE_TRACE_ID = '4f7c2a1098be42d5a1708f65d34ce821';

const STAGE_STACK_FRAMES: Record<string, string> = {
  serial: 'com.acme.search.pipeline.SearchRequestPipeline.execute(SearchContext)',
  'query-parallel': 'com.acme.search.query.QueryUnderstandingStage.execute(SearchContext)',
  'recall-parallel': 'com.acme.search.recall.MultiRecallStage.execute(SearchContext)',
  'feature-parallel': 'com.acme.search.feature.FeatureFetchStage.execute(SearchContext)',
  ranking: 'com.acme.search.ranking.RankingPipeline.execute(SearchContext)',
  'response-parallel': 'com.acme.search.response.ResponseEnrichmentStage.execute(SearchContext)',
  async: 'com.acme.search.async.SearchPostProcessor.handle(SearchEvent)',
};

function getExecutionMode(event: PerformanceEvent): 'serial' | 'parallel' | 'join' | 'async' {
  if (event.category === 'async') return 'async';
  if (event.name.startsWith('[Join]')) return 'join';
  if (event.category?.includes('parallel')) return 'parallel';
  return 'serial';
}

function getThreadName(event: PerformanceEvent, index: number): string {
  const existingWorker = event.details?.worker;
  const existingExecutor = event.details?.executor;

  if (typeof existingWorker === 'string') return existingWorker;
  if (typeof existingExecutor === 'string') return existingExecutor;

  switch (event.category) {
    case 'recall-parallel':
      return `recall-io-${(index % 6) + 1}`;
    case 'feature-parallel':
      return `feature-io-${(index % 5) + 1}`;
    case 'response-parallel':
      return `response-cpu-${(index % 4) + 1}`;
    case 'async':
      return `search-async-${(index % 4) + 1}`;
    default:
      return 'search-http-12';
  }
}

function getOperationClassName(name: string): string {
  return name
    .replace(/^\[[^\]]+]\s*/, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('');
}

function enrichEventDetails(event: PerformanceEvent, index: number): PerformanceEvent {
  const executionMode = getExecutionMode(event);
  const operationClass = getOperationClassName(event.name);
  const stageFrame = STAGE_STACK_FRAMES[event.category || 'serial'] || STAGE_STACK_FRAMES.serial;

  return {
    ...event,
    details: {
      traceId: SAMPLE_TRACE_ID,
      spanId: `span-${String(index + 1).padStart(3, '0')}`,
      parentSpanId: executionMode === 'async' ? 'span-async-root' : 'span-request-root',
      serviceName: 'search-backend',
      threadName: getThreadName(event, index),
      threadState: executionMode === 'parallel' ? 'WAITING' : 'RUNNABLE',
      executionMode,
      operation: event.name.replace(/^\[[^\]]+]\s*/, ''),
      timing: {
        startMs: event.start,
        endMs: event.start + event.duration,
        durationMs: event.duration,
      },
      callStack: [
        'com.acme.search.api.SearchController.search(SearchRequest)',
        'com.acme.search.service.SearchService.execute(SearchCommand)',
        stageFrame,
        `com.acme.search.span.${operationClass}.execute(SpanContext)`,
      ],
      ...event.details,
    },
  };
}

export function getSearchBackendSampleData(): PerformanceData {
  const events: PerformanceEvent[] = [
    // 请求入口：严格串行执行。
    { name: 'Receive HTTP Request', start: 0, duration: 2, category: 'serial', details: { worker: 'http-12' } },
    { name: 'Initialize Trace Context', start: 2, duration: 1, category: 'serial', details: { sampled: true } },
    { name: 'Validate Access Token', start: 3, duration: 6, category: 'serial', details: { dependency: 'auth-service' } },
    { name: 'Check Tenant Rate Limit', start: 9, duration: 3, category: 'serial', details: { dependency: 'redis-rate-limit' } },
    { name: 'Parse and Validate Parameters', start: 12, duration: 4, category: 'serial', details: { pageSize: 20 } },
    { name: 'Normalize Query', start: 16, duration: 4, category: 'serial', details: { normalizedQuery: '无线 降噪 耳机' } },

    // 查询理解：多个 CPU / 模型任务并行，等待最慢分支后汇合。
    { name: 'Detect Search Intent', start: 20, duration: 33, category: 'query-parallel', details: { executor: 'qu-pool-1' } },
    { name: 'Extract Named Entities', start: 20, duration: 26, category: 'query-parallel', details: { executor: 'qu-pool-2' } },
    { name: 'Correct Spelling and Expand Synonyms', start: 20, duration: 38, category: 'query-parallel', details: { executor: 'qu-pool-3' } },
    { name: 'Enrich Region and Device Context', start: 22, duration: 18, category: 'query-parallel', details: { executor: 'qu-pool-4' } },
    { name: '[Join] Merge Query Understanding Results', start: 58, duration: 5, category: 'serial', details: { waitsFor: ['intent detection', 'entity extraction', 'query expansion', 'context enrichment'] } },
    { name: 'Check Search Safety Policy', start: 63, duration: 5, category: 'serial', details: { policy: 'search-safe-v3' } },

    // 多路召回：RPC 与本地索引并行执行。
    { name: 'Retrieve from Inverted Index', start: 68, duration: 43, category: 'recall-parallel', details: { hits: 1800, shard: 'local-index' } },
    { name: 'Retrieve Semantic Vector Matches', start: 68, duration: 71, category: 'recall-parallel', details: { hits: 500, dependency: 'vector-search' } },
    { name: 'Retrieve Personalized Results', start: 68, duration: 54, category: 'recall-parallel', details: { hits: 320, dependency: 'recommend-service' } },
    { name: 'Retrieve Fresh Content', start: 70, duration: 35, category: 'recall-parallel', details: { hits: 160 } },
    { name: 'Retrieve Ad Candidates', start: 72, duration: 29, category: 'recall-parallel', details: { hits: 40, dependency: 'ads-recall' } },
    { name: 'Retrieve from Remote Shards', start: 70, duration: 77, category: 'recall-parallel', details: { hits: 760, shardCount: 8 } },
    { name: '[Join] Merge and Deduplicate Retrieval Results', start: 147, duration: 7, category: 'serial', details: { before: 3580, after: 2260 } },

    // 特征获取：并行访问多个后端，实时特征是本阶段关键路径。
    { name: 'Read Static Document Features', start: 154, duration: 29, category: 'feature-parallel', details: { dependency: 'feature-store' } },
    { name: 'Read User Profile Features', start: 154, duration: 22, category: 'feature-parallel', details: { dependency: 'profile-service' } },
    { name: 'Query Real-Time CTR Features', start: 154, duration: 44, category: 'feature-parallel', details: { dependency: 'realtime-feature' } },
    { name: 'Query Inventory Availability', start: 156, duration: 35, category: 'feature-parallel', details: { dependency: 'inventory-service' } },
    { name: 'Query Ad Bidding Features', start: 158, duration: 28, category: 'feature-parallel', details: { dependency: 'ads-bidder' } },
    { name: '[Join] Combine Features and Fill Missing Values', start: 198, duration: 7, category: 'serial', details: { featureCount: 286 } },

    // 排序：粗排串行，精排与广告排序并行后再次汇合。
    { name: 'Apply Rule-Based Pre-Filter', start: 205, duration: 9, category: 'ranking', details: { candidates: 2260 } },
    { name: 'Run Lightweight Pre-Ranker', start: 214, duration: 20, category: 'ranking', details: { input: 2260, output: 300 } },
    { name: 'Run Deep Learning Ranker', start: 234, duration: 26, category: 'ranking', details: { model: 'search-rank-v18' } },
    { name: 'Rank Ad Bids', start: 234, duration: 18, category: 'ranking', details: { candidates: 18 } },
    { name: '[Join] Blend Organic and Sponsored Results', start: 260, duration: 4, category: 'ranking', details: { organic: 280, sponsored: 8 } },
    { name: 'Apply Diversity Re-Ranking', start: 264, duration: 9, category: 'ranking', details: { algorithm: 'MMR' } },
    { name: 'Apply Business and Compliance Rules', start: 273, duration: 5, category: 'ranking', details: { output: 20 } },

    // 响应补全：展示信息并行生成。
    { name: 'Generate Snippets and Highlights', start: 278, duration: 14, category: 'response-parallel', details: { documents: 20 } },
    { name: 'Build Breadcrumbs and Facets', start: 278, duration: 21, category: 'response-parallel', details: { facetCount: 12 } },
    { name: 'Highlight Query Terms', start: 278, duration: 10, category: 'response-parallel', details: { documents: 20 } },
    { name: 'Generate Next-Page Cursor', start: 280, duration: 6, category: 'response-parallel', details: { cursorVersion: 2 } },
    { name: '[Join] Assemble Response Fields', start: 299, duration: 3, category: 'serial', details: { resultCount: 20 } },
    { name: 'Serialize JSON Response', start: 302, duration: 5, category: 'serial', details: { bytes: 18432 } },
    { name: 'Compress Response with Gzip', start: 307, duration: 4, category: 'serial', details: { compressedBytes: 6240 } },
    { name: 'Send HTTP Response', start: 311, duration: 4, category: 'serial', details: { status: 200, totalMs: 315 } },

    // 异步任务：提交后立即返回，不阻塞 315ms 的同步响应。
    { name: '[Async] Publish Query Log to Kafka', start: 302, duration: 4, category: 'async', details: { blocking: false, topic: 'search-query-log' } },
    { name: '[Async] Export Request Metrics and Trace', start: 304, duration: 3, category: 'async', details: { blocking: false, exporter: 'otel' } },
    { name: '[Async] Publish Search Behavior Event', start: 306, duration: 4, category: 'async', details: { blocking: false, topic: 'search-behavior' } },
    { name: '[Async] Persist Query Log', start: 322, duration: 38, category: 'async', details: { worker: 'log-consumer-7' } },
    { name: '[Async] Update Trending Query Statistics', start: 325, duration: 46, category: 'async', details: { worker: 'hot-query-worker' } },
    { name: '[Async] Warm Vector Query Cache', start: 330, duration: 82, category: 'async', details: { worker: 'cache-warmer', ttl: 600 } },
    { name: '[Async] Store Ranking Feature Sample', start: 336, duration: 49, category: 'async', details: { worker: 'feature-sampler', sampleRate: 0.01 } },
    { name: '[Async] Archive Full Trace', start: 350, duration: 90, category: 'async', details: { worker: 'trace-archiver', storage: 'object-store' } },
  ];

  return {
    title: 'Search Backend Request Processing Flow',
    events: events.map(enrichEventDetails),
  };
}
