import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("docs", "routes/docs.tsx", [
    index("routes/docs/overview.tsx"),
    route("getting-started", "routes/docs/getting-started.tsx"),
    route("system-requirements", "routes/docs/system-requirements.tsx"),
    route("cli", "routes/docs/cli.tsx"),
    route("chat", "routes/docs/chat.tsx"),
  ]),
] satisfies RouteConfig;
