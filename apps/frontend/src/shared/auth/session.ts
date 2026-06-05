import { cookies } from "next/headers";

export async function hasPortalSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.has("bumd_session");
}
