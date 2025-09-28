import React, { useState } from 'react';

const JsonFormatter = () => {
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');

  const formatJson = () => {
    try {
      const parsed = JSON.parse(input);
      const formatted = JSON.stringify(parsed, null, 2);
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

  return (
    <div className="tool-container">
      <h2>JSON格式化工具</h2>
      <div className="tool-content">
        <div className="input-section">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="请输入JSON字符串..."
            rows={10}
          />
        </div>
        <div className="button-section">
          <button onClick={formatJson}>格式化</button>
          <button onClick={clearAll}>清空</button>
        </div>
        {error && <div className="error">{error}</div>}
        {output && (
          <div className="output-section">
            <h3>格式化结果:</h3>
            <pre>{output}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default JsonFormatter;
