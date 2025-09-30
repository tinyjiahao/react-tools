import React, { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import MessageToast from './MessageToast';

const JsonFormatter = () => {
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isMinified, setIsMinified] = useState<boolean>(false);
  const [showCopyToast, setShowCopyToast] = useState<boolean>(false);
  const editorRef = useRef<any>(null);

  // 递归解析JSON字符串中的合法JSON值
  const parseJsonRecursively = (obj: any): any => {
    if (typeof obj === 'string') {
      // 尝试解析字符串是否为合法的JSON
      try {
        const parsed = JSON.parse(obj);
        // 如果解析成功，递归处理解析后的结果
        return parseJsonRecursively(parsed);
      } catch {
        // 如果不是合法的JSON，保持原字符串
        return obj;
      }
    } else if (Array.isArray(obj)) {
      // 处理数组中的每个元素
      return obj.map(item => parseJsonRecursively(item));
    } else if (obj && typeof obj === 'object') {
      // 处理对象中的每个属性
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = parseJsonRecursively(value);
      }
      return result;
    }
    // 其他类型直接返回
    return obj;
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(input);
      // 递归解析JSON字符串中的合法JSON值
      const deeplyParsed = parseJsonRecursively(parsed);
      const formatted = isMinified
        ? JSON.stringify(deeplyParsed)
        : JSON.stringify(deeplyParsed, null, 2);
      setOutput(formatted);
      setError('');
    } catch (err) {
      setError('无效的JSON格式: ' + (err as Error).message);
      setOutput('');
    }
  };

  const clearAll = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  const copyToClipboard = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      setShowCopyToast(true);
    }
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
  };

  const handleInputChange = (value: string | undefined) => {
    setInput(value || '');
  };

  // Monaco Editor 配置
  const editorOptions = {
    selectOnLineNumbers: true,
    roundedSelection: false,
    readOnly: false,
    cursorStyle: 'line' as const,
    automaticLayout: true,
    folding: true,
    foldingHighlight: true,
    showFoldingControls: 'mouseover' as const,
    lineNumbers: 'on' as const,
    lineNumbersMinChars: 3,
    lineDecorationsWidth: 0,
    glyphMargin: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderLineHighlight: 'all' as const,
    fontSize: 14,
    fontFamily: 'SF Mono, Monaco, Inconsolata, Roboto Mono, Courier New, monospace',
    wordWrap: 'on' as const,
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
  };

  const outputEditorOptions = {
    ...editorOptions,
    readOnly: true,
  };

  // 计算编辑器高度
  const calculateEditorHeight = (content: string) => {
    if (!content.trim()) {
      return '400px'; // 空内容时使用固定高度
    }

    const lineCount = content.split('\n').length;
    const minHeight = 400; // 最小高度
    const maxHeight = 800; // 最大高度
    const lineHeight = 22; // 每行高度（包含行间距）
    const padding = 40; // 边距

    const calculatedHeight = Math.max(minHeight, Math.min(maxHeight, lineCount * lineHeight + padding));
    return `${calculatedHeight}px`;
  };

  return (
    <div className="json-formatter">
      <div className="json-toolbar">
        <div className="toolbar-left">
          <h2>JSON格式化工具</h2>
          <span className="toolbar-desc">输入JSON数据进行格式化和验证</span>
        </div>
        <div className="toolbar-right">
          <label className="format-toggle">
            <input
              type="checkbox"
              checked={isMinified}
              onChange={(e) => setIsMinified(e.target.checked)}
            />
            压缩输出
          </label>
          <button className="btn btn-primary" onClick={formatJson}>
            格式化
          </button>
          <button className="btn btn-secondary" onClick={clearAll}>
            清空
          </button>
        </div>
      </div>

      <div className="json-content">
        <div className="json-panel json-input">
          <div className="panel-header">
            <h3>输入JSON数据</h3>
            <div className="panel-actions">
              <span className="char-count">{input.length} 字符</span>
            </div>
          </div>
          <div className="panel-body">
            <Editor
              height={calculateEditorHeight(input)}
              defaultLanguage="json"
              value={input}
              onChange={handleInputChange}
              onMount={handleEditorDidMount}
              options={editorOptions}
              theme="vs-light"
            />
            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="json-panel json-output">
          <div className="panel-header">
            <h3>格式化结果</h3>
            <div className="panel-actions">
              {output && (
                <>
                  <span className="char-count">{output.length} 字符</span>
                  <button className="btn-icon" onClick={copyToClipboard} title="复制到剪贴板">
                    📋
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="panel-body">
            {output ? (
              <Editor
                height={calculateEditorHeight(output)}
                defaultLanguage="json"
                value={output}
                options={outputEditorOptions}
                theme="vs-light"
              />
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📝</div>
                <p>格式化后的JSON将显示在这里</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 复制成功提示 */}
      <MessageToast show={showCopyToast} message="复制成功！" />
    </div>
  );
};

export default JsonFormatter;
