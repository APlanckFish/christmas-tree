import {
  type RouteConfig,
  index,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("phone-camera", "routes/phone-camera.tsx"),
  route("api/ws", "routes/api.ws.ts"),
  // Catch-all route for 404 pages (must be last)
  route("*", "routes/$.tsx"),
] satisfies RouteConfig;
