const HOP_BY_HOP = new Set([
  "host","connection","keep-alive","proxy-authenticate","proxy-authorization",
  "te","trailer","transfer-encoding","upgrade","forwarded",
  "x-forwarded-host","x-forwarded-proto","x-forwarded-port",
]);
const FALLBACK_URL  = "https://t.me/AshFamVPN";
const NO_BODY_METHS = new Set(["GET", "HEAD"]);
const REAL_IP_HDRS  = ["x-real-ip", "x-forwarded-for"];
const NF_PREFIXES   = ["x-nf-", "x-netlify-"];
const SUB_CONTENT = "UExBQ0VIT0xERVJfQ09ORklHUwo=";

export default async function relay(request, _context) {
  try {
    const { pathname, search } = new URL(request.url);
    const xHost = request.headers.get("x-host");

    // Sub endpoint
    if (pathname === "/sub") {
      return new Response(SUB_CONTENT, {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-cache",
          "profile-title": "AshFam Netlify",
          "subscription-userinfo": "upload=0; download=0; total=107374182400; expire=1767225600",
        }
      });
    }

    // Root with no x-host → fallback
    if (pathname === "/" && !xHost) {
      const upgrade = (request.headers.get("upgrade") ?? "").toLowerCase();
      if (upgrade !== "websocket") {
        return new Response(`<html><body><a href="${FALLBACK_URL}">AshFam VPN</a></body></html>`, {
          headers: { "content-type": "text/html; charset=UTF-8" },
        });
      }
    }

    if (!xHost) {
      return new Response("Error: x-host header is missing.", { status: 400 });
    }

    // Build upstream URL
    let targetUrl;
    if (xHost.startsWith("http://") || xHost.startsWith("https://")) {
      targetUrl = xHost + pathname + search;
    } else {
      const useHttps = !xHost.includes(":") || xHost.includes(":443") || /^s\d+\./.test(xHost);
      targetUrl = (useHttps ? "https://" : "http://") + xHost + pathname + search;
    }

    const outHeaders = new Headers();
    let clientIp = null;
    for (const [name, value] of request.headers) {
      const lower = name.toLowerCase();
      if (HOP_BY_HOP.has(lower)) continue;
      if (NF_PREFIXES.some((p) => lower.startsWith(p))) continue;
      if (lower === "x-host") continue;
      if (lower === REAL_IP_HDRS[0]) { clientIp = value; continue; }
      if (lower === REAL_IP_HDRS[1]) { if (!clientIp) clientIp = value; continue; }
      outHeaders.set(lower, value);
    }
    if (clientIp) outHeaders.set("x-forwarded-for", clientIp);

    const method  = request.method;
    const hasBody = !NO_BODY_METHS.has(method);
    const body    = hasBody && request.body ? await request.arrayBuffer() : null;

    const upstream = await fetch(targetUrl, { method, headers: outHeaders, redirect: "manual", body });
    const resHeaders = new Headers();
    for (const [name, value] of upstream.headers) {
      if (name.toLowerCase() === "transfer-encoding") continue;
      resHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  } catch {
    return new Response("Bad Gateway: Relay Failed", { status: 502 });
  }
}
