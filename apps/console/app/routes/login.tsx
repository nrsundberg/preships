import { useState } from "react";
import { Link, redirect, useSearchParams } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { signIn } from "~/lib/auth-client";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { getConsoleSession } = await import("~/lib/auth.server");
  const session = await getConsoleSession(request, context);
  if (session) {
    throw redirect("/");
  }

  return null;
}

export const meta: MetaFunction = () => [
  { title: "Sign In | Preships Console" },
  {
    name: "description",
    content: "Sign in to Preships Console with email/password, Google, or GitHub.",
  },
];

export default function LoginRoute() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.email({
        email,
        password,
        callbackURL: redirectTo,
      });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed.");
      } else {
        window.location.href = redirectTo;
        return;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const handleSocial = async (provider: "google" | "github") => {
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.social({ provider, callbackURL: redirectTo });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed.");
        setLoading(false);
        return;
      }
      const url = result.data?.url;
      if (url) {
        window.location.href = url;
        return;
      }
      setLoading(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <div className="w-full rounded-2xl border border-border bg-panel p-6 shadow-lg shadow-black/20">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-text-muted">
          Use your Preships account to access the console.
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text-primary">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text-primary">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-xs uppercase tracking-wide text-text-muted">
          Other sign-in methods
        </p>
        <div className="mt-2 space-y-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSocial("google")}
            className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-panel-soft disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M21.35 11.1H12v2.9h5.4c-.23 1.25-1.46 3.65-5.4 3.65-3.25 0-5.9-2.68-5.9-5.98S8.75 5.7 12 5.7c1.85 0 3.1.76 3.8 1.4l2.58-2.48C17.9 3.12 15.6 2 12 2 6.48 2 2 6.48 2 12s4.48 10 10 10c5.85 0 9.7-4.1 9.7-9.85 0-.67-.07-1.18-.17-1.55z" />
              </svg>
              Google
            </span>
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSocial("github")}
            className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-panel-soft disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.86-.01-1.7-2.78.62-3.37-1.36-3.37-1.36-.46-1.18-1.12-1.5-1.12-1.5-.91-.64.07-.63.07-.63 1 .07 1.52 1.06 1.52 1.06.9 1.58 2.36 1.12 2.94.85.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.32.1-2.74 0 0 .84-.28 2.75 1.05A9.2 9.2 0 0 1 12 7.06c.85 0 1.7.12 2.5.35 1.9-1.33 2.74-1.05 2.74-1.05.56 1.42.21 2.48.1 2.74.64.72 1.03 1.63 1.03 2.75 0 3.95-2.35 4.81-4.58 5.07.36.32.68.95.68 1.92 0 1.38-.01 2.5-.01 2.84 0 .26.18.58.69.48A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
              </svg>
              GitHub
            </span>
          </button>
        </div>

        <p className="mt-5 text-sm text-text-muted">
          New to Preships?{" "}
          <Link
            to={`/signup?redirectTo=${encodeURIComponent(redirectTo)}`}
            className="text-accent hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
