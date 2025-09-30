import React, { useState, useEffect } from 'react';

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

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  if (!visible) return null;

  return (
    <div className="copy-toast">
      <div className="toast-content">
        <span className="toast-icon">✅</span>
        <span className="toast-message">{message}</span>
      </div>
    </div>
  );
};

export default MessageToast;
