import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { forwardAuthRequest } from "~/lib/auth-route.server";

export function loader({ request, context }: LoaderFunctionArgs) {
  return forwardAuthRequest(request, context);
}

export function action({ request, context }: ActionFunctionArgs) {
  return forwardAuthRequest(request, context);
}
