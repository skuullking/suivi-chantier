import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "chantierlink" },
  redact: {
    paths: ["password", "*.password", "token", "*.token", "authorization", "*.authorization", "cookie"],
    censor: "[masqué]",
  },
});
