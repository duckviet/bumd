import { redirect } from "next/navigation";

export function RootPage(): never {
  redirect("/app");
}
