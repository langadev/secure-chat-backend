import type { Server } from "socket.io";

let io: Server | null = null;

export function setIO(instance: Server) {
  io = instance;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO não foi inicializado (chame initRealtime(server) no bootstrap).");
  }
  return io;
}
