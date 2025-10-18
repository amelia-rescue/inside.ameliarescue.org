import type { Config } from "@react-router/dev/config";

declare module "react-router" {
  interface Future {
    v8_middleware: true;
  }
}

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  future: {
    v8_middleware: true,
  },
  appDirectory: "app",
} satisfies Config;
