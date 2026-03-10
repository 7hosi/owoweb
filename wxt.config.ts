import { defineConfig } from "wxt"

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-solid"],
  manifest: {
    description: "Send images to owocr and display text boxes overlayed on the image.",
    homepage_url: "https://github.com/7hosi/owoweb",
    host_permissions: ["<all_urls>"],
    permissions: ["storage"],
  },
})
