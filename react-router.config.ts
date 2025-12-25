import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "app",
  ssr: true,
  serverModuleFormat: "esm",
  buildDirectory: "build",
} satisfies Config;
