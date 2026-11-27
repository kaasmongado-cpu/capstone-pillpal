const path = require("path");
const Module = require("module");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const projectNodeModules = path.resolve(projectRoot, "node_modules");

// Ensure hoisted tools in root node_modules (like babel-preset-expo)
// can resolve workspace-nested packages (like expo/config or react)
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${projectNodeModules}${path.delimiter}${process.env.NODE_PATH}`
  : projectNodeModules;
Module._initPaths();

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  projectNodeModules,
  path.resolve(monorepoRoot, "node_modules"),
];

// 3. Map workspace & pinned React 18 packages explicitly for Metro
config.resolver.extraNodeModules = {
  "@pillpal/auth": path.resolve(monorepoRoot, "packages/auth"),
  react: path.resolve(projectNodeModules, "react"),
  "react-dom": path.resolve(projectNodeModules, "react-dom"),
};

// 4. Custom request resolver for monorepo isolation & browser compatibility
const originalResolveRequest = config.resolver.resolveRequest;
const projectEntryOrigin = path.join(projectRoot, "package.json");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Always resolve React & React DOM from apps/patient-mobile (React 18.3.1)
  // so hoisted root packages never pull in React 19.
  if (
    moduleName === "react" ||
    moduleName.startsWith("react/") ||
    moduleName === "react-dom" ||
    moduleName.startsWith("react-dom/")
  ) {
    return context.resolveRequest(
      { ...context, originModulePath: projectEntryOrigin },
      moduleName,
      platform
    );
  }

  // Redirect @pillpal/auth client to mobile-safe entry (avoids Vite's import.meta syntax in non-module Metro scripts)
  if (
    context.originModulePath.includes(`${path.sep}packages${path.sep}auth`) &&
    !context.originModulePath.endsWith("client.mobile.ts") &&
    (moduleName === "./client.js" || moduleName === "./client")
  ) {
    return {
      filePath: path.resolve(monorepoRoot, "packages/auth/src/client.mobile.ts"),
      type: "sourceFile",
    };
  }

  // Handle ESM-style .js extensions in shared TypeScript workspace packages (e.g., ./auth.js -> ./auth.ts)
  if (
    moduleName.endsWith(".js") &&
    context.originModulePath.includes(`${path.sep}packages${path.sep}auth`)
  ) {
    try {
      return context.resolveRequest(context, moduleName.replace(/\.js$/, ""), platform);
    } catch {
      // Fallback to default resolution
    }
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
