import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["ui-components"],
  allowedDevOrigins: ["172.17.132.30"],
  experimental: {
    proxyClientMaxBodySize: 50 * 1024 * 1024,
  },
  turbopack: {
    root: path.resolve(path.join(__dirname, "..", "..")),
  },
};

export default nextConfig;
