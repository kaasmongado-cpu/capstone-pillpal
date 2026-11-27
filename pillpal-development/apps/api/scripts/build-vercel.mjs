import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "..");
const dbEntry = path.resolve(apiRoot, "../../packages/database/src/index.ts");

await build({
  entryPoints: [path.resolve(apiRoot, "src/app.ts")],
  outfile: path.resolve(apiRoot, "api/_app.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  logLevel: "info",
  plugins: [
    {
      name: "bundle-workspace-database-only",
      setup(buildCtx) {
        // Inline @pillpal/database (including Prisma 7 generated TypeScript client)
        buildCtx.onResolve({ filter: /^@pillpal\/database(\/.*)?$/ }, () => ({
          path: dbEntry,
        }));

        // Keep all other bare npm packages & node:* builtins external so Vercel traces node_modules normally
        buildCtx.onResolve({ filter: /^[^./]/ }, (args) => {
          if (path.isAbsolute(args.path)) return null;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
