import { useEffect, useRef } from 'react';
interface Props { busy: boolean; onChoose: (choice: 'apply' | 'discard' | 'cancel') => void }
const EmbeddedJsonDecision = ({ busy, onChoose }: Props) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="jw-dialog embedded-decision" aria-label="处理内层草稿" onCancel={e => { e.preventDefault(); if (!busy) onChoose('cancel'); }}>
    <h3>处理内层草稿</h3><p>内层草稿尚未应用到文件。请选择如何离开。</p>
    <div className="jw-actions"><button disabled={busy} onClick={() => onChoose('apply')}>应用并返回</button><button disabled={busy} onClick={() => onChoose('discard')}>放弃修改</button><button autoFocus disabled={busy} onClick={() => onChoose('cancel')}>继续编辑</button></div>
  </dialog>;
};
export default EmbeddedJsonDecision;
