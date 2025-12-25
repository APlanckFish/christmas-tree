/**
 * Handle .well-known requests (Chrome DevTools, security.txt, etc.)
 * Returns empty response to avoid 404 errors in console
 */

import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  
  // Chrome DevTools 配置请求
  if (url.pathname.includes("chrome.devtools")) {
    return new Response(null, { status: 204 }); // No Content
  }
  
  // 其他 .well-known 请求
  return new Response("Not Found", { status: 404 });
}

export default function WellKnown() {
  return null;
}
