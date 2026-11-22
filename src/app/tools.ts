// 定义工具类型
export type ToolType = 'json' | 'diff' | 'qr' | 'url-encoder' | 'byte-converter' | 'base64' | 'r2-manager' | 'markdown-viewer' | 'r2-image-manager' | 'notes' | 'drawio' | 'performance' | 'jsonl-viewer' | 'impl-viewer' | 'sse-viewer' | 'curl-builder' | 'regex' | 'timestamp' | 'uuid' | 'jwt';

// 定义工具分类
interface ToolCategory {
  name: string;
  icon: string;
  tools: Array<{
    id: ToolType;
    name: string;
    description: string;
  }>;
}

export const toolCategories: ToolCategory[] = [
  {
    name: 'JSON工具',
    icon: 'json',
    tools: [
      { id: 'json', name: 'JSON格式化', description: 'JSON数据格式化和验证' }
    ]
  },
  {
    name: 'LLM查看',
    icon: 'book',
    tools: [
      { id: 'jsonl-viewer', name: 'JSONL查看器', description: '逐行查看JSONL文件内容' },
      { id: 'impl-viewer', name: 'IMPL查看器', description: '解析IMPL_JSON代码实现方案' },
      { id: 'sse-viewer', name: 'SSE查看器', description: '拼接SSE流式响应为可读格式' }
    ]
  },
  {
    name: '文本与编码',
    icon: 'diff',
    tools: [
      { id: 'diff', name: '文本差异对比', description: '比较两个文本的差异' },
      { id: 'byte-converter', name: '字节转换', description: '不同字节单位之间的转换' },
      { id: 'base64', name: 'Base64压缩编码', description: '文本压缩并Base64编码' },
      { id: 'url-encoder', name: 'URL编解码', description: 'URL编码和解码' },
      { id: 'regex', name: '正则测试', description: '正则表达式实时匹配与捕获组' }
    ]
  },
  {
    name: '网络与请求',
    icon: 'url',
    tools: [
      { id: 'qr', name: 'URL转二维码', description: '生成二维码' },
      { id: 'curl-builder', name: 'cURL构建器', description: '根据URL/Params/Headers生成cURL命令' },
      { id: 'jwt', name: 'JWT解码', description: '解码JWT的Header与Payload' }
    ]
  },
  {
    name: 'R2存储',
    icon: 'cloud',
    tools: [
      { id: 'r2-manager', name: 'R2文件管理', description: 'Cloudflare R2存储文件管理' },
      { id: 'r2-image-manager', name: 'R2图片管理', description: 'Cloudflare R2图片存储管理' },
      { id: 'markdown-viewer', name: 'Markdown预览', description: 'Markdown在线预览与管理' },
      { id: 'notes', name: '云端备忘录', description: '支持Markdown的云端备忘录' },
      { id: 'drawio', name: '在线画图', description: '使用draw.io编辑并云端保存图表' }
    ]
  },
  {
    name: '开发辅助',
    icon: 'activity',
    tools: [
      { id: 'performance', name: '性能分析器', description: '上传数据生成甘特图进行性能分析' },
      { id: 'timestamp', name: '时间戳转换', description: 'Unix时间戳与日期互转' },
      { id: 'uuid', name: 'UUID生成器', description: '批量生成UUID/ULID' }
    ]
  }
];

// 工具ID到URL路径的映射
export const toolIdToPath: Record<ToolType, string> = {
  'json': 'json',
  'diff': 'diff',
  'qr': 'qr',
  'url-encoder': 'url-encoder',
  'byte-converter': 'byte-converter',
  'base64': 'base64',
  'r2-manager': 'r2-manager',
  'markdown-viewer': 'markdown-viewer',
  'r2-image-manager': 'r2-image-manager',
  'notes': 'notes',
  'drawio': 'drawio',
  'performance': 'performance',
  'jsonl-viewer': 'jsonl-viewer',
  'impl-viewer': 'impl-viewer',
  'sse-viewer': 'sse-viewer',
  'curl-builder': 'curl-builder',
  'regex': 'regex',
  'timestamp': 'timestamp',
  'uuid': 'uuid',
  'jwt': 'jwt'
};

// URL路径到工具ID的映射
export const pathToToolId: Record<string, ToolType> = {
  'json': 'json',
  'diff': 'diff',
  'qr': 'qr',
  'url-encoder': 'url-encoder',
  'byte-converter': 'byte-converter',
  'base64': 'base64',
  'r2-manager': 'r2-manager',
  'markdown-viewer': 'markdown-viewer',
  'r2-image-manager': 'r2-image-manager',
  'notes': 'notes',
  'drawio': 'drawio',
  'performance': 'performance',
  'jsonl-viewer': 'jsonl-viewer',
  'impl-viewer': 'impl-viewer',
  'sse-viewer': 'sse-viewer',
  'curl-builder': 'curl-builder',
  'regex': 'regex',
  'timestamp': 'timestamp',
  'uuid': 'uuid',
  'jwt': 'jwt'
};

