import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";
import type { LinksFunction } from "react-router";
import type { ReactNode } from "react";

import "./styles.css";

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", type: "image/png", href: "/icons/favicon-32x32.png", sizes: "32x32" },
  { rel: "icon", type: "image/png", href: "/icons/favicon-16x16.png", sizes: "16x16" },
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-bg text-text-primary">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  let message = "Unknown error";
  let details = "Something went wrong.";

  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`;
    details = error.data || details;
  } else if (error instanceof Error) {
    message = error.message;
    details = error.stack ?? details;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">{message}</h1>
      <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-code-bg p-4 text-sm">
        {details}
      </pre>
    </main>
  );
}
