import { NavLink } from "react-router";

const NAV = [
  {
    title: "Install",
    links: [
      { to: "/docs/getting-started", label: "Getting Started" },
      { to: "/docs/system-requirements", label: "System Requirements" },
    ],
  },
  {
    title: "Configuration",
    links: [
      { to: "/docs", label: "Overview" },
      { to: "/docs/cli", label: "CLI Usage" },
      { to: "/docs/chat", label: "Chat Mode" },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="border-b border-border bg-panel p-5 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-b-0 md:border-r">
      <NavLink
        to="/"
        className="mb-5 block font-bold tracking-tight text-text-primary no-underline"
      >
        Preships
        <span className="block text-xs font-medium text-text-muted">
          Pre-ship checks. Before you ship.
        </span>
      </NavLink>

      {NAV.map((group) => (
        <div key={group.title} className="mb-5">
          <div className="mb-1.5 text-xs uppercase tracking-wider text-text-muted">
            {group.title}
          </div>
          {group.links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `my-0.5 block rounded-lg px-2.5 py-2 text-sm text-text-content no-underline transition-colors hover:bg-panel-soft ${
                  isActive ? "bg-accent-soft text-white" : ""
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      ))}

      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-2 text-xs uppercase tracking-wider text-text-muted">
          Console
        </div>
        <a
          href="https://console.preships.io/login"
          className="my-0.5 block rounded-lg border border-border px-2.5 py-2 text-sm text-text-content no-underline transition-colors hover:bg-panel-soft"
        >
          Login
        </a>
        <a
          href="https://console.preships.io/signup"
          className="my-2 block rounded-lg bg-accent-soft px-2.5 py-2 text-sm font-medium text-white no-underline transition-colors hover:bg-panel-soft"
        >
          Sign up
        </a>
      </div>
    </aside>
  );
}
