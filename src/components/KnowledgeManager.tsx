import React, { useState, useEffect } from 'react';
import Icon from './Icon';

// TipTap/ProseMirror 节点类型定义
interface TextNode {
  type: 'text';
  text: string;
  marks?: Array<{
    type: string;
    [key: string]: any;
  }>;
}

interface BaseNode {
  type: string;
  attrs?: Record<string, any>;
  content?: Array<BaseNode | TextNode>;
}

interface KmData {
  status: number;
  data: {
    title: string;
    body: string; // body 是一个 JSON 字符串
  };
}

// 递归渲染节点
const renderNode = (node: BaseNode | TextNode, index: number): React.ReactNode => {
  if (node.type === 'text') {
    const textNode = node as TextNode;
    let content: React.ReactNode = textNode.text;

    // 处理标记（marks）
    if (textNode.marks) {
      textNode.marks.forEach(mark => {
        switch (mark.type) {
          case 'strong':
            content = <strong key={index}>{content}</strong>;
            break;
          case 'em':
            content = <em key={index}>{content}</em>;
            break;
          case 'code':
            content = <code key={index}>{content}</code>;
            break;
          case 'link':
            content = <a key={index} href={mark.href} target="_blank" rel="noopener noreferrer">{content}</a>;
            break;
          case 'underline':
            content = <u key={index}>{content}</u>;
            break;
          case 'strike':
            content = <s key={index}>{content}</s>;
            break;
          default:
            break;
        }
      });
    }

    return content;
  }

  const baseNode = node as BaseNode;

  if (!baseNode.content || baseNode.content.length === 0) {
    return null;
  }

  switch (baseNode.type) {
    case 'doc':
      return (
        <div key={index} className="km-doc">
          {baseNode.content?.map((child, i) => renderNode(child, i))}
        </div>
      );

    case 'paragraph':
      return (
        <p key={index} className="km-paragraph">
          {baseNode.content?.map((child, i) => renderNode(child, i))}
        </p>
      );

    case 'heading':
      const level = baseNode.attrs?.level || 1;
      const headingProps: any = {
        key: index,
        className: `km-heading km-h${level}`
      };

      if (level === 1) return <h1 {...headingProps}>{baseNode.content?.map((child, i) => renderNode(child, i))}</h1>;
      if (level === 2) return <h2 {...headingProps}>{baseNode.content?.map((child, i) => renderNode(child, i))}</h2>;
      if (level === 3) return <h3 {...headingProps}>{baseNode.content?.map((child, i) => renderNode(child, i))}</h3>;
      if (level === 4) return <h4 {...headingProps}>{baseNode.content?.map((child, i) => renderNode(child, i))}</h4>;
      if (level === 5) return <h5 {...headingProps}>{baseNode.content?.map((child, i) => renderNode(child, i))}</h5>;
      return <h6 {...headingProps}>{baseNode.content?.map((child, i) => renderNode(child, i))}</h6>;

    case 'title':
      return (
        <h1 key={index} className="km-title">
          {baseNode.content?.map((child, i) => renderNode(child, i))}
        </h1>
      );

    case 'bulletList':
      return (
        <ul key={index} className="km-bullet-list">
          {baseNode.content?.map((child, i) => renderNode(child, i))}
        </ul>
      );

    case 'orderedList':
      return (
        <ol key={index} className="km-ordered-list">
          {baseNode.content?.map((child, i) => renderNode(child, i))}
        </ol>
      );

    case 'listItem':
      return (
        <li key={index} className="km-list-item">
          {baseNode.content?.map((child, i) => renderNode(child, i))}
        </li>
      );

    case 'codeBlock':
      const language = baseNode.attrs?.language || '';
      return (
        <pre key={index} className={`km-code-block ${language}`}>
          <code>{baseNode.content?.map((child, i) => renderNode(child, i))}</code>
        </pre>
      );

    case 'blockquote':
      return (
        <blockquote key={index} className="km-blockquote">
          {baseNode.content?.map((child, i) => renderNode(child, i))}
        </blockquote>
      );

    case 'horizontalRule':
      return <hr key={index} className="km-hr" />;

    case 'hardBreak':
      return <br key={index} />;

    case 'image':
      return (
        <img
          key={index}
          src={baseNode.attrs?.src}
          alt={baseNode.attrs?.alt || ''}
          className="km-image"
        />
      );

    case 'table':
      return (
        <table key={index} className="km-table">
          <tbody>
            {baseNode.content?.map((child, i) => renderNode(child, i))}
          </tbody>
        </table>
      );

    case 'tableRow':
      return (
        <tr key={index} className="km-table-row">
          {baseNode.content?.map((child, i) => renderNode(child, i))}
        </tr>
      );

    case 'tableCell':
    case 'tableHeader':
      const Tag = baseNode.type === 'tableHeader' ? 'th' : 'td';
      return (
        <Tag key={index} className={`km-${baseNode.type}`}>
          {baseNode.content?.map((child, i) => renderNode(child, i))}
        </Tag>
      );

    case 'catalog':
      return null; // 忽略目录节点

    case 'drawio':
      // Drawio 图表渲染
      const drawioSrc = baseNode.attrs?.src;
      const drawioWidth = baseNode.attrs?.width || '100%';
      const drawioHeight = baseNode.attrs?.height || 'auto';
      const drawioBorder = baseNode.attrs?.border ? '1px solid var(--cf-gray-border)' : 'none';

      if (drawioSrc) {
        return (
          <div key={index} className="km-drawio-container" style={{ textAlign: 'center', margin: '16px 0' }}>
            <iframe
              title="Drawio 图表"
              src={drawioSrc}
              width={typeof drawioWidth === 'number' ? `${drawioWidth}px` : drawioWidth}
              height={typeof drawioHeight === 'number' ? `${drawioHeight}px` : drawioHeight}
              style={{
                border: drawioBorder,
                borderRadius: '8px',
                maxWidth: '100%'
              }}
              scrolling="auto"
            />
          </div>
        );
      }
      return null;

    default:
      console.warn('Unknown node type:', baseNode.type);
      return (
        <div key={index} className="km-unknown">
          {baseNode.content?.map((child, i) => renderNode(child, i))}
        </div>
      );
  }
};

const KnowledgeManager = () => {
  const [data, setData] = useState<KmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/docs/km.txt');
        const text = await response.text();

        // 检查响应是否是 HTML（404 页面）
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          throw new Error('知识库数据文件不存在，请在 /public/docs/km.txt 添加数据');
        }

        if (!response.ok) {
          throw new Error(`加载失败: ${response.status} ${response.statusText}`);
        }

        const json = JSON.parse(text) as KmData;
        setData(json);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="tool-container">
        <h2>知识库</h2>
        <div className="tool-content">
          <div className="loading-state">加载中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tool-container">
        <h2>知识库</h2>
        <div className="tool-content">
          <div className="error-message">
            <Icon name="warning" size={18} className="error-icon" />
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // 解析 body 字符串为 JSON 对象
  let bodyData: { type: string; content: Array<BaseNode | TextNode> };
  try {
    bodyData = JSON.parse(data.data.body);
  } catch (err) {
    setError('Body 数据解析失败');
    return (
      <div className="tool-container">
        <h2>知识库 - {data.data.title}</h2>
        <div className="tool-content">
          <div className="error-message">
            <Icon name="warning" size={18} className="error-icon" />
            Body 数据解析失败
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tool-container km-page">
      <h2>知识库 - {data.data.title}</h2>
      <div className="tool-content km-scrollable">
        <div className="km-content">
          {bodyData.content?.map((node, index) => renderNode(node, index))}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeManager;
