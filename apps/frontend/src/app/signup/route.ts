import { redirect } from "next/navigation";
import { registerUser } from "../../shared/auth/auth-store";

export async function GET(): Promise<Response> {
  return new Response(
    '<!doctype html><html><body><main><h1>Sign up</h1><form method="post" action="/signup"><label>Name <input name="name"></label><label>Email <input name="email" type="email"></label><label>Password <input name="password" type="password"></label><button type="submit">Create account</button></form><a href="/login">Log in</a></main></body></html>',
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  await registerUser({
    email: stringValue(form.get("email")),
    password: stringValue(form.get("password")),
    name: stringValue(form.get("name")),
  });
  redirect("/login?created=1");
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

