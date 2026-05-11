import db from '../db';
import { getIo } from '../socket';

export interface NotificationPayload {
  type: 'new_question' | 'new_answer' | 'thread_answered';
  threadId: number;
  userId?: number;
  sessionId: number;
}

export function createNotification(userId: number, threadId: number, type: NotificationPayload['type']) {
  db.prepare(
    'INSERT INTO notifications (user_id, thread_id, type) VALUES (?, ?, ?)'
  ).run(userId, threadId, type);
}

export function notifyAdminsOfQuestion(threadId: number, sessionId: number) {
  const admins = db.prepare('SELECT id FROM users WHERE role IN ("office", "admin")').all() as { id: number }[];
  for (const admin of admins) {
    createNotification(admin.id, threadId, 'new_question');
  }
  getIo().to(`session:${sessionId}`).emit('notification:new_question', { threadId, sessionId });
}

export function notifyQuestionerOfAnswer(threadId: number, sessionId: number, createdById: string) {
  const thread = db.prepare('SELECT created_by FROM message_threads WHERE id = ?').get(threadId) as { created_by: string };
  const user = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(thread.created_by) as { id: number } | undefined;

  if (user) {
    createNotification(user.id, threadId, 'new_answer');
  }

  getIo().to(`session:${sessionId}`).emit('notification:new_answer', { threadId, sessionId });
}

export function getUnreadNotificationCount(userId: number): number {
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL'
  ).get(userId) as { count: number };
  return result.count;
}

export function markNotificationsAsRead(threadId: number, userId: number) {
  db.prepare(
    'UPDATE notifications SET read_at = datetime("now") WHERE thread_id = ? AND user_id = ? AND read_at IS NULL'
  ).run(threadId, userId);
}

export function getUnreadThreads(userId: number, sessionId: number) {
  return db.prepare(`
    SELECT DISTINCT mt.id
    FROM message_threads mt
    WHERE mt.session_id = ?
      AND EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.thread_id = mt.id AND n.user_id = ? AND n.read_at IS NULL
      )
  `).all(sessionId, userId) as { id: number }[];
}
