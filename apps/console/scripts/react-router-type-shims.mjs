import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = join(process.cwd(), ".react-router", "types", "app");
const routesDir = join(base, "routes");

mkdirSync(routesDir, { recursive: true });

const rootShimPath = join(base, "root.js.d.ts");
writeFileSync(
  rootShimPath,
  `export { default } from "../../../app/root";
export * from "../../../app/root";
`,
  "utf8",
);

const routeNames = [
  "app-shell",
  "billing",
  "dashboard",
  "usage",
  "settings",
  "signup",
  "login",
  "login-device",
];

for (const name of routeNames) {
  const shimPath = join(routesDir, `${name}.js.d.ts`);
  writeFileSync(
    shimPath,
    `export { default } from "../../../../app/routes/${name}";
export * from "../../../../app/routes/${name}";
`,
    "utf8",
  );
}
