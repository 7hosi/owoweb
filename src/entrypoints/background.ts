export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id })

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FETCH_IMAGE_BYTES") {
      fetch(message.url)
        .then((res) => res.arrayBuffer())
        .then((buffer) => {
          // Convert ArrayBuffer to Array because serializing raw buffers
          // through messages can sometimes be finicky depending on the browser
          const uint8Array = new Uint8Array(buffer)
          sendResponse({ success: true, data: Array.from(uint8Array) })
        })
        .catch((err) => sendResponse({ success: false, error: err.message }))

      return true // Keeps the message channel open for async response
    }
  })
})
