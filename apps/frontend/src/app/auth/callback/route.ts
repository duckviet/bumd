import { redirect } from "next/navigation";

export function GET(request: Request): Response {
  const callbackUrl = new URL(request.url).searchParams.get("callbackUrl") ?? "/app";
  redirect(callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/app");
}

