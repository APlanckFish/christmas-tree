/**
 * Catch-all route for 404 pages
 * Handles Chrome DevTools requests and other non-existent routes
 */

import { useLocation } from "react-router";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
  return [{ title: "404 - Page Not Found" }];
};

export default function NotFound() {
  const location = useLocation();

  // Chrome DevTools 请求，静默处理
  if (
    location.pathname.startsWith("/.well-known/") ||
    location.pathname.includes("chrome.devtools")
  ) {
    return null;
  }

  // 其他 404 页面
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        color: "white",
        textAlign: "center",
        padding: "20px",
      }}
    >
      <h1 style={{ fontSize: "6rem", margin: 0 }}>404</h1>
      <h2 style={{ fontSize: "2rem", marginTop: "1rem" }}>
        🎄 Oops! Page Not Found
      </h2>
      <p style={{ fontSize: "1.2rem", marginTop: "1rem", opacity: 0.9 }}>
        The page <code>{location.pathname}</code> doesn't exist.
      </p>
      <a
        href="/"
        style={{
          marginTop: "2rem",
          padding: "1rem 2rem",
          background: "white",
          color: "#667eea",
          textDecoration: "none",
          borderRadius: "8px",
          fontWeight: "bold",
          fontSize: "1.1rem",
          transition: "transform 0.2s",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = "scale(1.05)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        🏠 Back to Home
      </a>
    </div>
  );
}
