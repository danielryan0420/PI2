// Socket.io disabled - Flask doesn't implement real-time updates yet
// These functions are no-ops to prevent errors

export function getSocket() {
  return {
    on: () => {},
    off: () => {},
    emit: () => {},
  };
}

export function joinSession(sessionId: number) {
  // No-op
}

export function leaveSession(sessionId: number) {
  // No-op
}
