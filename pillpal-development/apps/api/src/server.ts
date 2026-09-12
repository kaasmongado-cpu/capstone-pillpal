import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { adminSetupRoute } from "./routes/admin-setup.js";
import { adminSetupStatusRoute } from "./routes/admin-setup-status.js";
import { healthRoute } from "./routes/health.js";
import { meRoute } from "./routes/me.js";
import { providersRoute } from "./routes/providers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load apps/api/.env
dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const PORT = 4000;
const ALLOWED_ORIGIN = "http://localhost:5173";

const server = createServer((req, res) => {
  // CORS headers
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGIN,
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  // Handle browser CORS preflight requests.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        message: "PILLPAL API is running",
      }),
    );

    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    healthRoute(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/me") {
    void meRoute(req, res);
    return;
  }

  if (
    req.method === "GET" &&
    req.url === "/setup/admin/status"
  ) {
    void adminSetupStatusRoute(req, res);
    return;
  }

  if (
    req.method === "POST" &&
    req.url === "/setup/admin"
  ) {
    void adminSetupRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/providers")) {
    void providersRoute(req, res);
    return;
  }

  res.writeHead(404, {
    "Content-Type": "application/json",
  });

  res.end(
    JSON.stringify({
      message: "Route not found",
    }),
  );
});

server.listen(PORT, () => {
  console.log(
    `PILLPAL API running at http://localhost:${PORT}`,
  );
});