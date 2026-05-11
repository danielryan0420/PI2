import React from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { Badge } from './Badge';
import { formatDateTime } from '../../lib/utils';

interface NotificationItem {
  id: number;
  threadId: number;
  type: 'new_question' | 'new_answer' | 'thread_answered';
  threadTitle?: string;
  createdAt: string;
  isRead: boolean;
}

interface NotificationPanelProps {
  notifications: NotificationItem[];
  onNotificationClick?: (threadId: number) => void;
  onClose?: () => void;
}

export function NotificationPanel({
  notifications,
  onNotificationClick,
  onClose,
}: NotificationPanelProps) {
  const typeLabels: Record<string, string> = {
    new_question: 'New Question',
    new_answer: 'New Answer',
    thread_answered: 'Thread Answered',
  };

  const typeColors: Record<string, string> = {
    new_question: 'info',
    new_answer: 'success',
    thread_answered: 'success',
  };

  return (
    <Card className="fixed right-4 top-16 w-80 shadow-lg z-50">
      <CardHeader className="flex items-center justify-between">
        <h3 className="font-bold">Notifications</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        )}
      </CardHeader>
      <CardBody className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="text-center text-gray-500 py-4">No notifications</p>
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map(notif => (
              <button
                key={notif.id}
                onClick={() => {
                  onNotificationClick?.(notif.threadId);
                  onClose?.();
                }}
                className={`p-3 rounded text-left transition ${
                  notif.isRead
                    ? 'bg-gray-50 hover:bg-gray-100'
                    : 'bg-blue-50 hover:bg-blue-100 border-l-4 border-blue-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={typeColors[notif.type] as any}>
                    {typeLabels[notif.type]}
                  </Badge>
                  {!notif.isRead && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                </div>
                {notif.threadTitle && (
                  <p className="text-sm font-semibold truncate">{notif.threadTitle}</p>
                )}
                <p className="text-xs text-gray-500">
                  {formatDateTime(notif.createdAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
