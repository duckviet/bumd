import type { MultipartField } from "./types";

export function buildMultipartBody(fields: readonly MultipartField[], boundary: string): string {
  let body = "";
  for (const field of fields) {
    if (!field.enabled || !field.key.trim()) continue;
    body += `--${boundary}\r\n`;
    if (field.type === "file" && field.fileName) {
      body += `Content-Disposition: form-data; name="${field.key}"; filename="${field.fileName}"\r\n`;
      body += `Content-Type: ${field.contentType || "application/octet-stream"}\r\n\r\n`;
      body += `${field.value}\r\n`;
    } else {
      body += `Content-Disposition: form-data; name="${field.key}"\r\n\r\n`;
      body += `${field.value}\r\n`;
    }
  }
  body += `--${boundary}--\r\n`;
  return body;
}

export function parseMultipartBody(body: string, contentTypeHeader: string): MultipartField[] {
  const match = contentTypeHeader.match(/boundary=(.+)/i);
  if (!match) return [];
  const boundary = match[1]!.trim();
  
  const parts = body.split(`--${boundary}`);
  const fields: MultipartField[] = [];
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === "--") continue;
    
    const headerEndIndex = trimmed.indexOf("\r\n\r\n");
    if (headerEndIndex === -1) continue;
    
    const headersSection = trimmed.slice(0, headerEndIndex);
    const content = trimmed.slice(headerEndIndex + 4);
    
    const nameMatch = headersSection.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const key = nameMatch[1]!;
    
    const filenameMatch = headersSection.match(/filename="([^"]+)"/i);
    const isFile = Boolean(filenameMatch);
    const fileName = filenameMatch ? filenameMatch[1] : undefined;
    
    const typeMatch = headersSection.match(/Content-Type:\s*([^\r\n]+)/i);
    const contentType = typeMatch ? typeMatch[1]!.trim() : undefined;
    
    fields.push({
      id: `multipart-${Math.random()}`,
      key,
      value: content,
      type: isFile ? "file" : "text",
      fileName,
      contentType,
      enabled: true,
      isCustom: true,
    });
  }
  
  return fields;
}
