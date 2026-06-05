export function backendBaseUrl(): string {
  const value = process.env["BUMD_BACKEND_URL"];
  if (value === undefined || value.trim() === "") {
    return "http://127.0.0.1:3000";
  }
  return value;
}

export const PortalRevalidateSeconds = 30;
