// Monaco 本地打包配置（不依赖 CDN）。
//
// @monaco-editor/react 默认通过 @monaco-editor/loader 从 jsDelivr CDN 加载 monaco-editor。
// 这里改为使用本地打包的 monaco-editor，并配置编辑器 worker，使整个 Monaco 完全离线可用。
//
// 机制：
//   1. loader.config({ monaco }) —— 告诉 loader 使用我们 import 进来的本地 monaco 实例，
//      loader 不再去 CDN 拉取。
//   2. self.MonacoEnvironment.getWorker —— Monaco 内部按语言创建对应的 Web Worker。
//      用 Vite 的 `?worker` 后缀导入，Vite 会自动产出 worker 文件并处理 URL。

import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// 配置 Monaco 的 worker 加载器（按 label 路由到对应语言的 worker）
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new JsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new CssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker();
      case 'typescript':
      case 'javascript':
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

// 让 @monaco-editor/react 使用本地打包的 monaco，而非 CDN
loader.config({ monaco });

export { monaco };
