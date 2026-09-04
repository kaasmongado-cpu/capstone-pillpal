import { createServer } from "node:http";
import { healthRoute } from "./routes/health.js";

const PORT = 4000;

const server = createServer((req, res) => {
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
  console.log(`PILLPAL API running at http://localhost:${PORT}`);
});