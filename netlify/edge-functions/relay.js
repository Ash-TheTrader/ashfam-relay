const HOP_BY_HOP = new Set([
  "host","connection","keep-alive","proxy-authenticate","proxy-authorization",
  "te","trailer","transfer-encoding","upgrade","forwarded",
  "x-forwarded-host","x-forwarded-proto","x-forwarded-port",
]);
const NO_BODY_METHS = new Set(["GET", "HEAD"]);
const NF_PREFIXES = ["x-nf-", "x-netlify-"];
const SUB_CONTENT = "PLACEHOLDER";

export default async function relay(request, _context) {
  try {
    const { pathname, search } = new URL(request.url);
    const xHost = request.headers.get("x-host");

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

    if (!xHost) {
      return new Response("<html><body>AshFam VPN</body></html>", {
        headers: { "content-type": "text/html; charset=UTF-8" }
      });
    }

    let targetUrl;
    if (xHost.startsWith("http://") || xHost.startsWith("https://")) {
      targetUrl = xHost + pathname + search;
    } else {
      const useHttps = !xHost.includes(":") || xHost.includes(":443");
      targetUrl = (useHttps ? "https://" : "http://") + xHost + pathname + search;
    }

    const outHeaders = new Headers();
    let clientIp = null;
    for (const [name, value] of request.headers) {
      const lower = name.toLowerCase();
      if (HOP_BY_HOP.has(lower)) continue;
      if (NF_PREFIXES.some(p => lower.startsWith(p))) continue;
      if (lower === "x-host") continue;
      if (lower === "x-real-ip") { clientIp = value; continue; }
      if (lower === "x-forwarded-for") { if (!clientIp) clientIp = value; continue; }
      outHeaders.set(lower, value);
    }
    if (clientIp) outHeaders.set("x-forwarded-for", clientIp);

    const method = request.method;
    const body = !NO_BODY_METHS.has(method) && request.body
      ? await request.arrayBuffer() : null;

    const upstream = await fetch(targetUrl, { method, headers: outHeaders, redirect: "manual", body });
    const resHeaders = new Headers();
    for (const [name, value] of upstream.headers) {
      if (name.toLowerCase() === "transfer-encoding") continue;
      resHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  } catch (e) {
    return new Response("Bad Gateway: " + e.message, { status: 502 });
  }
}
