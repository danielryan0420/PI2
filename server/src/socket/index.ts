import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';

let io: SocketServer;

export function initSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  const inventory = io.of('/inventory');

  inventory.on('connection', (socket: Socket) => {
    socket.on('join_session', ({ sessionId }: { sessionId: number }) => {
      socket.join(`session:${sessionId}`);
    });

    socket.on('leave_session', ({ sessionId }: { sessionId: number }) => {
      socket.leave(`session:${sessionId}`);
    });

    socket.on('disconnect', () => {
      // cleanup handled automatically by Socket.io
    });
  });

  return io;
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io.of('/inventory') as unknown as SocketServer;
}
