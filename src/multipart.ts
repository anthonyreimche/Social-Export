// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// A multipart/form-data body as bytes: api.network.fetch takes a string or
// bytes, not FormData.

export type Part = { name: string; value: string } | { name: string; filename: string; type: string; data: Uint8Array };

const quote = (s: string) => s.replace(/[\r\n"\\]/g, (c) => (c === '"' ? "%22" : c === "\\" ? "\\\\" : " "));

export function multipart(parts: Part[], boundary = `----SafelightBoundary${crypto.randomUUID().replace(/-/g, "")}`): { body: Uint8Array; contentType: string } {
  const utf8 = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${quote(part.name)}"`;
    if ("data" in part) head += `; filename="${quote(part.filename)}"\r\nContent-Type: ${part.type}`;
    chunks.push(utf8.encode(`${head}\r\n\r\n`));
    chunks.push("data" in part ? part.data : utf8.encode(part.value));
    chunks.push(utf8.encode("\r\n"));
  }
  chunks.push(utf8.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    body.set(c, at);
    at += c.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
