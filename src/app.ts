// src/app.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import routes from "./routes/index.js";

const app = express();

// se usares proxy/ingress
app.set("trust proxy", 1);

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api", routes);
app.use("/uploads", express.static("uploads"));
// Error handler
app.use(
  (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.message === "USER_NOT_FOUND") return res.status(404).json({ error: "Utilizador não encontrado" });
    if (err?.message === "EMAIL_IN_USE") return res.status(409).json({ error: "Email já em uso" });
    if (err?.name === "ZodError") return res.status(400).json({ error: "Dados inválidos", issues: err.issues });
    if (err?.message === "UNAUTHORIZED") return res.status(401).json({ error: "UNAUTHORIZED" });
    console.error("Unhandled error:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
);

export default app;
