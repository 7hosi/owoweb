import { render } from "solid-js/web"
import Popup from "@/components/Overlay"

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  main,
})

const markedAsAlreadyOcrdClass = "owoweb-overlay"

function main(): void {
  console.log("owoweb loaded")

  const activeOverlays = new WeakMap<Element, HTMLDivElement>()

  document.addEventListener(
    "click",
    (event) => {
      const elements = document.elementsFromPoint(event.clientX, event.clientY)

      const targets = elements.filter(
        (el) => el instanceof HTMLImageElement || el instanceof HTMLCanvasElement,
      )

      // If clicking inside an existing overlay, do nothing
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(`.${markedAsAlreadyOcrdClass}`)
      ) {
        console.info("The target of the click is an element that already has a popup rendered")
        return
      }

      if (targets.length === 0) {
        console.info("No target to OCR")
      }

      for (const el of targets) {
        // Only create one overlay per element
        if (activeOverlays.has(el)) {
          console.info("The target element found from the click point already has a popup rendered")
          return
        }

        console.log("Rendering popup for target element from click point. The target element:", el)

        const container = document.createElement("div")
        container.classList.add(markedAsAlreadyOcrdClass)
        document.body.appendChild(container)

        activeOverlays.set(el, container)

        const rect = el.getBoundingClientRect()

        const image = new Promise<ArrayBuffer | null>(async (resolve, reject) => {
          try {
            if (el instanceof HTMLCanvasElement) {
              el.toBlob(async (blob) => {
                if (!blob) {
                  return reject(new Error("No blob"))
                }
                resolve(await blob.arrayBuffer())
              }, "image/png")
            } else if (el instanceof HTMLImageElement) {
              try {
                const response = await browser.runtime.sendMessage({
                  type: "FETCH_IMAGE_BYTES",
                  url: el.src,
                })

                if (response.success) {
                  // Reconstruct the ArrayBuffer from the returned array
                  const buffer = new Uint8Array(response.data).buffer
                  resolve(buffer)
                } else {
                  throw new Error(response.error)
                }
              } catch (err) {
                reject(err)
              }
            } else {
              resolve(null)
            }
          } catch (error) {
            reject(error)
          }
        })

        image
          .then((image) => {
            console.log(image)
            // Render our Solid Component
            render(
              () => <Popup rect={rect} tagName={el.tagName.toLowerCase()} image={image} />,
              container,
            )
          })
          .catch((error) => {
            console.error("Error getting image:", error)

            event.preventDefault()
            event.stopPropagation()
          })
      }
    },
    { capture: true },
  )
}
