import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/inventory', {
      path: '/socket.io',
      autoConnect: true,
    });
  }
  return socket;
}

export function joinSession(sessionId: number) {
  getSocket().emit('join_session', { sessionId });
}

export function leaveSession(sessionId: number) {
  getSocket().emit('leave_session', { sessionId });
}
