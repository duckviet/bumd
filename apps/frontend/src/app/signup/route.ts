import { redirect } from "next/navigation";
import { registerUser } from "../../shared/auth/auth-store";
import { styledHtmlPage } from "../../shared/ui/styled-html";

export async function GET(): Promise<Response> {
  const content = `<h1>Sign up</h1><form method="post" action="/signup"><label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label><label>Password <input name="password" type="password" required></label><button type="submit">Create account</button></form><a href="/login">Log in</a>`;
  return new Response(
    styledHtmlPage("Sign up", "ventriloc", content),
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

