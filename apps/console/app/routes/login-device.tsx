import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { MetaFunction } from "react-router";

import { getConsoleSession } from "~/lib/auth.server";
import { approveDeviceSession } from "~/lib/device-auth.server";

type CloudflareEnv = {
  AUTH_DB?: unknown;
};

type LoaderData = {
  code: string;
};

type ActionData = {
  status: "approved" | "expired" | "not_found" | "error";
  message: string;
};

export const meta: MetaFunction = () => [
  { title: "Approve CLI Login | Preships Console" },
  {
    name: "description",
    content: "Approve Preships CLI device login requests from your authenticated console session.",
  },
];

function getAuthDbFromContext(context: unknown) {
  const cloudflareContext =
    typeof context === "object" && context !== null && "cloudflare" in context
      ? (context.cloudflare as { env?: CloudflareEnv })
      : undefined;

  return cloudflareContext?.env?.AUTH_DB;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getConsoleSession(request);
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim();

  if (!session) {
    const redirectTo = `${url.pathname}${url.search}`;
    throw redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return { code } satisfies LoaderData;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const session = await getConsoleSession(request);
  if (!session) {
    const url = new URL(request.url);
    const redirectTo = `${url.pathname}${url.search}`;
    throw redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  const formData = await request.formData();
  const code = `${formData.get("code") ?? ""}`.trim();
  if (!code) {
    return {
      status: "error",
      message: "Missing device code.",
    } satisfies ActionData;
  }

  const authDb = getAuthDbFromContext(context);
  if (!authDb) {
    return {
      status: "error",
      message: "Device auth service is unavailable.",
    } satisfies ActionData;
  }

  const result = await approveDeviceSession(
    authDb as Parameters<typeof approveDeviceSession>[0],
    code,
  );

  if (result === "approved") {
    return {
      status: "approved",
      message: "Device login approved. You can return to the CLI.",
    } satisfies ActionData;
  }

  if (result === "expired") {
    return {
      status: "expired",
      message: "This device code has expired. Start login again from the CLI.",
    } satisfies ActionData;
  }

  return {
    status: "not_found",
    message: "Device code is invalid or already used.",
  } satisfies ActionData;
}

export default function LoginDeviceRoute() {
  const { code } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <div className="w-full rounded-2xl border border-border bg-panel p-6 shadow-lg shadow-black/20">
        <h1 className="text-2xl font-semibold">Approve CLI Login</h1>
        <p className="mt-2 text-sm text-text-muted">
          Confirm this request to finish signing in from the Preships CLI.
        </p>

        <div className="mt-5 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary">
          <span className="text-text-muted">Device code: </span>
          <code>{code || "missing"}</code>
        </div>

        {actionData && (
          <p
            className={`mt-4 text-sm ${
              actionData.status === "approved" ? "text-accent" : "text-yellow-300"
            }`}
          >
            {actionData.message}
          </p>
        )}

        <Form method="post" className="mt-6 space-y-3">
          <input type="hidden" name="code" value={code} />
          <button
            type="submit"
            disabled={!code}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Approve login
          </button>
          <Link
            to="/"
            className="block rounded-lg border border-border px-4 py-2 text-center text-sm font-medium text-text-primary hover:bg-panel-soft"
          >
            Back to dashboard
          </Link>
        </Form>
      </div>
    </main>
  );
}
