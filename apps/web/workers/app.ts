import { createRequestHandler, RouterContextProvider } from "react-router";

const buildImport = () => import("../build/server/index.js");

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    Object.assign(process.env, env);

    const context = new RouterContextProvider();
    (context as { cloudflare?: unknown }).cloudflare = { env, ctx };

    const serverMode = env.ENVIRONMENT === "development" ? "development" : "production";
    return createRequestHandler(buildImport, serverMode)(request, context);
  },
} satisfies ExportedHandler;
