import { signOut } from "../../../auth";

export async function GET(): Promise<Response> {
  return new Response('<!doctype html><html><body><main><h1>Log out</h1><form method="post" action="/logout"><button type="submit">Log out</button></form></main></body></html>', {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function POST(): Promise<Response> {
  await signOut({ redirectTo: "/login" });
  return new Response(null, { status: 303, headers: { location: "/login" } });
}

