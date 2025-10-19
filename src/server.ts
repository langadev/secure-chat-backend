// src/server.ts
import http from "node:http";
import app from "./app.js";
import { initRealtime } from "./realtime/socket.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const server = http.createServer(app);
initRealtime(server);

server.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
});
