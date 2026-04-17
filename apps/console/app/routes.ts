import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("api/auth/*", "routes/api/auth.ts"),
  route("login", "routes/login.tsx"),
  route("login/device", "routes/login-device.tsx"),
  route("signup", "routes/signup.tsx"),
  layout("routes/app-shell.tsx", [
    index("routes/dashboard.tsx"),
    route("billing", "routes/billing.tsx"),
    route("usage", "routes/usage.tsx"),
    route("settings", "routes/settings.tsx"),
    route("orgs/new", "routes/orgs.new.tsx"),
    route("orgs/:orgId/members", "routes/orgs.$orgId.members.tsx"),
    route("orgs/invites/:token/accept", "routes/orgs.invites.$token.accept.tsx"),
  ]),
] satisfies RouteConfig;
