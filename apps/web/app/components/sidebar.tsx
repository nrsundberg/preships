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
    <aside className="sidebar">
      <NavLink to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
        Preships
        <small>Pre-ship checks. Before you ship.</small>
      </NavLink>

      {NAV.map((group) => (
        <div key={group.title} className="nav-group">
          <div className="nav-title">{group.title}</div>
          {group.links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      ))}
    </aside>
  );
}
