import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';

interface MessageToastProps {
  show: boolean;
  message?: string;
  duration?: number;
}

const MessageToast: React.FC<MessageToastProps> = ({
  show,
  message = '操作成功！',
  duration = 3000
}) => {
  const [visible, setVisible] = useState(false);

  // 连续两次 show=true（如连续点"复制"）时，原来只依赖 show 的 effect 不会重跑，
  // 导致 toast 不再出现。这里用一个自增 token：每次 show 为 true 时改变它，
  // 驱动 effect 重新显示并重置计时。token 变化不会再次改变 show，因此无循环。
  const [token, setToken] = useState(0);
  const wasShownRef = useRef(false);
  if (show && !wasShownRef.current) {
    wasShownRef.current = true;
    setToken(t => t + 1);
  } else if (!show && wasShownRef.current) {
    wasShownRef.current = false;
  }

  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
    }, duration);
    return () => clearTimeout(timer);
    // token 让连续 show=true 也能重新触发
  }, [show, token, duration]);

  if (!visible) return null;

  return (
    <div className="copy-toast">
      <div className="toast-content">
        <Icon name="check" size={20} className="toast-icon" />
        <span className="toast-message">{message}</span>
      </div>
    </div>
  );
};

export default MessageToast;
