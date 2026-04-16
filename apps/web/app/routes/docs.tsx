import { Outlet } from "react-router";
import { Sidebar } from "~/components/sidebar";

export default function DocsLayout() {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[260px_1fr]">
      <Sidebar />
      <main className="max-w-[900px] px-6 py-11 md:px-14">
        <Outlet />
      </main>
    </div>
  );
}
