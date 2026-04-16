import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";
import type { ReactNode } from "react";

import "./styles.css";

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
