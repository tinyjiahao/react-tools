import React, { useState, useEffect } from 'react';
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
        <Icon name="check" size={20} className="toast-icon" />
        <span className="toast-message">{message}</span>
      </div>
    </div>
  );
};

export default MessageToast;
