/**
 * 打卡接口代理：解决浏览器 CORS
 * 路径：/check-login-ticket /get-card-info /create-card-log
 * 入口放在仓库根目录，避免 CI 中 "src/index.js not found"
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    const cors = {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, token, Referer",
      "Access-Control-Max-Age": "86400",
    };

    const path = url.pathname.replace(/\/+$/, "") || "/";

    const isApi =
      path === "/check-login-ticket" ||
      path === "/get-card-info" ||
      path === "/create-card-log";

    if (request.method === "OPTIONS" && isApi) {
      return new Response(null, { status: 204, headers: cors });
    }

    if (!isApi && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    let targetUrl = null;
    if (path === "/check-login-ticket") {
      targetUrl =
        "https://www.mychint.com:8087/webapikaoqin/api/v1/KaoQin/CheckLoginTicket";
    } else if (path === "/get-card-info") {
      targetUrl =
        "https://www.mychint.com:8087/webapikaoqin/api/v1/KaoQin/GetMyCardLogInfo";
    } else if (path === "/create-card-log") {
      targetUrl =
        "https://eip.chint.com/kaoqincardapi/api/v1/KaoQin/CreateCardLog";
    }

    if (!targetUrl) {
      return new Response(`Not found: ${path}`, {
        status: 404,
        headers: cors,
      });
    }

    const body = await request.arrayBuffer();

    const upstreamHeaders = new Headers();
    const contentType =
      request.headers.get("content-type") ||
      "application/x-www-form-urlencoded";
    upstreamHeaders.set("Content-Type", contentType);

    const tokenHeader =
      request.headers.get("token") || request.headers.get("Token");
    if (tokenHeader) upstreamHeaders.set("token", tokenHeader);

    if (path === "/create-card-log") {
      upstreamHeaders.set("Referer", "https://eip.chint.com/kq/mobile/");
    }

    const upstreamResp = await fetch(targetUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body,
    });

    const respHeaders = new Headers(upstreamResp.headers);
    Object.entries(cors).forEach(([k, v]) => respHeaders.set(k, v));

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: respHeaders,
    });
  },
};
