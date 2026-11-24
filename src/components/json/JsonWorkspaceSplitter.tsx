import { useEffect, useRef } from 'react';
interface Props { width: number; max: number; onChange: (width: number) => void; onCommit: (width: number) => void }
const JsonWorkspaceSplitter = ({ width, max, onChange, onCommit }: Props) => {
  const drag = useRef<{ x: number; start: number; value: number } | null>(null);
  const frame = useRef(0);
  const clamp = (value: number) => Math.max(200, Math.min(max, value));
  function cleanup() { cancelAnimationFrame(frame.current); document.body.classList.remove('jw-resizing'); }
  useEffect(() => () => { cancelAnimationFrame(frame.current); document.body.classList.remove('jw-resizing'); }, []);
  function cancel() { if (drag.current) { onChange(drag.current.start); drag.current = null; cleanup(); } }
  return <div className="jw-splitter" role="separator" aria-label="调整文件树宽度" aria-orientation="vertical" aria-valuemin={200} aria-valuemax={max} aria-valuenow={Math.round(width)} tabIndex={0}
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, start: width, value: width }; document.body.classList.add('jw-resizing'); }}
    onPointerMove={e => { const d = drag.current; if (!d) return; d.value = clamp(d.start + e.clientX - d.x); cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(() => onChange(d.value)); }}
    onPointerUp={e => { const d = drag.current; if (!d) return; drag.current = null; cleanup(); onChange(d.value); onCommit(d.value); e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onDoubleClick={() => { const value = clamp(240); onChange(value); onCommit(240); }}
    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); return; } const value = e.key === 'ArrowLeft' ? width - 10 : e.key === 'ArrowRight' ? width + 10 : e.key === 'Home' ? 200 : e.key === 'End' ? max : undefined; if (value !== undefined) { e.preventDefault(); onChange(clamp(value)); onCommit(clamp(value)); } }} />;
};
export default JsonWorkspaceSplitter;
