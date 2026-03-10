import { render } from "solid-js/web"
import Popup from "@/components/Overlay"

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  main,
})

const markedAsAlreadyOcrdClass = "owoweb-overlay"
const wrapperClass = "owoweb-wrapper"

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

        // Wrap the target element so the overlay is always positioned
        // relative to it – survives zoom, scroll, and layout changes.
        const wrapper = ensureWrapper(el)

        const container = document.createElement("div")
        container.classList.add(markedAsAlreadyOcrdClass)
        // Position the overlay container to fill the wrapper exactly
        container.style.position = "absolute"
        container.style.inset = "0"
        container.style.pointerEvents = "none"
        container.style.zIndex = "999999"
        wrapper.appendChild(container)

        activeOverlays.set(el, container)

        let foundCompatibleElement = false

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
              foundCompatibleElement = true
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
              () => <Popup tagName={el.tagName.toLowerCase()} image={image} />,
              container,
            )
          })
          .catch((error) => {
            console.error("Error getting image:", error)
          })

        if (foundCompatibleElement) {
          event.preventDefault()
          event.stopPropagation()
        }
      }
    },
    { capture: true },
  )
}

/**
 * Wrap the target element in a position:relative container so that the
 * overlay can be absolutely positioned on top of it.  If the element is
 * already wrapped (e.g. from a previous OCR run on a different image that
 * was swapped into the same slot), reuse the existing wrapper.
 */
function ensureWrapper(el: Element): HTMLDivElement {
  // Already wrapped?
  if (el.parentElement?.classList.contains(wrapperClass)) {
    return el.parentElement as HTMLDivElement
  }

  const wrapper = document.createElement("div")
  wrapper.classList.add(wrapperClass)
  wrapper.style.position = "relative"
  wrapper.style.display = "inline-block"

  // Inherit the element's dimensions so the wrapper matches exactly
  const computed = getComputedStyle(el)
  if (computed.display === "block") {
    wrapper.style.display = "block"
  }
  if (computed.maxWidth) {
    wrapper.style.maxWidth = computed.maxWidth
  }

  // Insert wrapper where the element is, then move element inside
  el.parentNode!.insertBefore(wrapper, el)
  wrapper.appendChild(el)

  return wrapper
}
