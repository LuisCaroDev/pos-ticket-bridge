/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

declare module "*.woff2?inline" {
  const source: string;
  export default source;
}
