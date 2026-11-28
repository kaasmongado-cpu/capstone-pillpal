// Vercel Serverless Function entrypoint for PILLPAL API (.mjs enforces ESM
// regardless of parent monorepo package.json "type" settings).
// Lazy-loads the esbuild-compiled ESM bundle (`./_app.mjs`) so any startup or
// environment error returns structured JSON + CORS headers instead of an opaque
// Vercel 500 FUNCTION_INVOCATION_FAILED crash.

let appModulePromise = null;

async function loadApp() {
  // Static hints for Vercel's Node File Trace (@vercel/nft) so Prisma 7's
  // PostgreSQL WASM query compiler files are always packaged into the Lambda.
  if (process.env.__VERCEL_NFT_PRISMA_HINT__ === "1") {
    await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.js");
    await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.js");
    await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs");
    await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs");
  }

  if (!appModulePromise) {
    appModulePromise = import("./_app.mjs").catch((err) => {
      appModulePromise = null;
      throw err;
    });
  }
  return appModulePromise;
}

export default async function handler(req, res) {
  try {
    const { handleApiRequest } = await loadApp();
    await handleApiRequest(req, res);
  } catch (err) {
    console.error("[PILLPAL API] Serverless bootstrap/handler error:", err);
    if (!res.headersSent) {
      const origin = req.headers?.origin;
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
      } else {
        res.setHeader("Access-Control-Allow-Origin", "*");
      }
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Idempotency-Key",
      );
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "API_BOOTSTRAP_ERROR",
          message: err instanceof Error ? err.message : String(err),
          code: err?.code ?? null,
        }),
      );
    }
  }
}
