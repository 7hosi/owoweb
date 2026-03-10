import { createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js"
import { owocrSettingsStore, ankiConnectSettingsStore } from "~/utils/storage"
import { OwocrSettings, AnkiConnectSettings } from "~/utils/settings"
import { addImageToLatestNote } from "~/utils/ankiconnect"

// ── Types ────────────────────────────────────────────────────────────────────

type BoundingBox = {
  center_x: number
  center_y: number
  height: number
  width: number
  rotation_z: number | null
}

type Word = {
  text: string
  bounding_box: BoundingBox
  separator: string
  symbols: unknown
}

type Line = {
  bounding_box: BoundingBox
  words: Word[]
  text: string
}

type Paragraph = {
  bounding_box: BoundingBox
  lines: Line[]
  writing_direction: "TOP_TO_BOTTOM" | "LEFT_TO_RIGHT"
}

type OcrResponse = {
  image_properties: {
    height: number
    width: number
  }
  paragraphs: Paragraph[]
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Overlay(props: {
  tagName: string
  image: string | ArrayBufferLike | ArrayBufferView<ArrayBufferLike> | null
}) {
  const [socket, setSocket] = createSignal<WebSocket | null>(null)
  const [ocrData, setOcrData] = createSignal<OcrResponse | null>(null)
  const [containerSize, setContainerSize] = createSignal({ width: 0, height: 0 })
  let containerRef!: HTMLDivElement

  // ── Anki state ──────────────────────────────────────────────────────────────
  const [ankiSettings, setAnkiSettings] = createSignal<AnkiConnectSettings | null>(null)
  const [ankiStatus, setAnkiStatus] = createSignal<"idle" | "sending" | "ok" | "error">("idle")
  const [ankiMessage, setAnkiMessage] = createSignal("")

  // Track the container size so font-size calculations stay correct on resize/zoom
  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(containerRef)
    onCleanup(() => observer.disconnect())
  })

  // Load settings
  owocrSettingsStore.getValue().then((settings) => {
    const ws = createWebSocket(settings)
    setSocket(ws)
  })

  ankiConnectSettingsStore.getValue().then((settings) => {
    setAnkiSettings(settings)
  })

  createEffect(() => {
    const ws = socket()
    if (!ws) return

    ws.onopen = () => {
      console.log("WebSocket opened")
      if (props.image === null) {
        console.warn("Did not receive image")
        return
      }
      ws.send(props.image)
    }

    ws.onmessage = (messageEv) => {
      if (messageEv.data === "True") {
        console.log("Waiting for response. Event:", messageEv)
      } else if (messageEv.data === "False") {
        console.warn("OCR failed. Event:", messageEv)
        ws.close()
      } else {
        const data = JSON.parse(messageEv.data) as OcrResponse
        console.log("Response received. Data:", data)
        ws.close()
        setOcrData(data)
      }
    }

    ws.onclose = () => console.log("WebSocket closed")
    ws.onerror = (error) => console.error("WebSocket error:", error)
  })

  async function handleAddToAnki() {
    const settings = ankiSettings()
    if (!settings) return

    if (!settings.noteType || !settings.pictureField) {
      setAnkiStatus("error")
      setAnkiMessage("Configure note type & picture field in the extension popup first.")
      return
    }

    if (!props.image) {
      setAnkiStatus("error")
      setAnkiMessage("No image available.")
      return
    }

    setAnkiStatus("sending")
    setAnkiMessage("")

    try {
      // Ensure we have an ArrayBuffer
      let buffer: ArrayBuffer
      if (props.image instanceof ArrayBuffer) {
        buffer = props.image
      } else if (ArrayBuffer.isView(props.image)) {
        buffer = props.image.buffer as ArrayBuffer
      } else {
        throw new Error("Unsupported image format")
      }

      const result = await addImageToLatestNote(settings, buffer)
      setAnkiStatus("ok")
      setAnkiMessage(`Added to note ${result.noteId}`)
      setTimeout(() => {
        setAnkiStatus("idle")
        setAnkiMessage("")
      }, 3000)
    } catch (err) {
      setAnkiStatus("error")
      setAnkiMessage(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      ref={containerRef}
      class="owoweb-overlay-root"
      style={{
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        "z-index": "999999",
        "pointer-events": "none",
      }}
    >
      {/* Inject scoped styles for the text boxes */}
      <OverlayStyles />

      {/* ── Anki toast (bottom-right corner) ───────────────────────── */}
      <Show when={ankiMessage()}>
        <div
          class={`owoweb-anki-toast ${
            ankiStatus() === "error"
              ? "owoweb-anki-toast-error"
              : ankiStatus() === "ok"
                ? "owoweb-anki-toast-success"
                : "owoweb-anki-toast-info"
          }`}
        >
          {ankiMessage()}
        </div>
      </Show>

      <Show when={ocrData()}>
        {(data) => (
          <For each={data().paragraphs}>
            {(paragraph) => (
              <TextBox
                paragraph={paragraph}
                containerWidth={containerSize().width}
                containerHeight={containerSize().height}
                onAddToAnki={handleAddToAnki}
              />
            )}
          </For>
        )}
      </Show>
    </div>
  )
}

// ── TextBox Component ────────────────────────────────────────────────────────

function TextBox(props: {
  paragraph: Paragraph
  containerWidth: number
  containerHeight: number
  onAddToAnki: () => void
}) {
  let boxRef!: HTMLDivElement

  const isVertical = () => props.paragraph.writing_direction === "TOP_TO_BOTTOM"
  const bb = () => props.paragraph.bounding_box

  // Use percentage-based positioning from the normalized bounding box (0–1)
  // so the position is always relative to the container / image.
  const leftPct = () => (bb().center_x - bb().width / 2) * 100
  const topPct = () => (bb().center_y - bb().height / 2) * 100
  const widthPct = () => bb().width * 100
  const heightPct = () => bb().height * 100

  // Compute a reasonable font size from the bounding boxes.
  // For vertical text, use the line width as the character size.
  // For horizontal text, use line height.
  // containerWidth / containerHeight are live (ResizeObserver) so this
  // auto-updates on zoom.
  const fontSize = () => {
    const lines = props.paragraph.lines
    if (lines.length === 0) return 16

    if (isVertical()) {
      const sizes = lines.map((l) => l.bounding_box.width * props.containerWidth)
      return Math.max(8, median(sizes))
    } else {
      const sizes = lines.map((l) => l.bounding_box.height * props.containerHeight)
      return Math.max(8, median(sizes))
    }
  }

  // ── Native capture-phase event interception ────────────────────────────────
  // Solid.js delegates events to the document root, so `stopPropagation()`
  // from an onClick prop does NOT prevent other native listeners (like a
  // manga reader's "next page" handler) from firing.  By attaching native
  // listeners with `capture: true` directly on the element we intercept
  // events *before* they can reach anything else in the DOM.
  onMount(() => {
    /** Kill an event completely so it never reaches the page. */
    const kill = (e: Event) => {
      e.stopPropagation()
      e.stopImmediatePropagation()
      e.preventDefault()
    }

    const captureOpts: AddEventListenerOptions = { capture: true }

    boxRef.addEventListener("click", kill, captureOpts)
    boxRef.addEventListener("mousedown", kill, captureOpts)
    boxRef.addEventListener("mouseup", kill, captureOpts)
    boxRef.addEventListener("pointerdown", kill, captureOpts)
    boxRef.addEventListener("pointerup", kill, captureOpts)
    boxRef.addEventListener("contextmenu", kill, captureOpts)
    boxRef.addEventListener("mousemove", kill, captureOpts)
    boxRef.addEventListener("touchstart", kill, captureOpts)
    boxRef.addEventListener("touchend", kill, captureOpts)

    // Double-click / double-tap → add image to Anki
    boxRef.addEventListener(
      "dblclick",
      (e) => {
        kill(e)
        props.onAddToAnki()
      },
      captureOpts,
    )

    onCleanup(() => {
      boxRef.removeEventListener("click", kill, captureOpts)
      boxRef.removeEventListener("mousedown", kill, captureOpts)
      boxRef.removeEventListener("mouseup", kill, captureOpts)
      boxRef.removeEventListener("pointerdown", kill, captureOpts)
      boxRef.removeEventListener("pointerup", kill, captureOpts)
      boxRef.removeEventListener("contextmenu", kill, captureOpts)
      boxRef.removeEventListener("mousemove", kill, captureOpts)
      boxRef.removeEventListener("touchstart", kill, captureOpts)
      boxRef.removeEventListener("touchend", kill, captureOpts)
    })
  })

  return (
    <div
      ref={boxRef}
      class="owoweb-textbox"
      style={{
        position: "absolute",
        left: `${leftPct()}%`,
        top: `${topPct()}%`,
        // Use min-width/min-height so the box *grows* to fit the text
        // when the OCR bounding box is too tight. The dark backdrop will
        // cover all visible text rather than clipping it.
        "min-width": `${widthPct()}%`,
        "min-height": `${heightPct()}%`,
        "writing-mode": isVertical() ? "vertical-rl" : "horizontal-tb",
        "font-size": `${fontSize()}px`,
        "line-height": "1.2",
        "pointer-events": "auto",
      }}
    >
      <span class="owoweb-textbox-content">
        <For each={props.paragraph.lines}>
          {(line, index) => (
            <>
              {line.text}
              <Show when={index() < props.paragraph.lines.length - 1}>
                <br />
              </Show>
            </>
          )}
        </For>
      </span>
    </div>
  )
}

// ── Scoped Styles ────────────────────────────────────────────────────────────

function OverlayStyles() {
  return (
    <style>{`
      .owoweb-textbox {
        /* Text is fully transparent / invisible by default */
        color: transparent;
        background: transparent;
        cursor: default;
        overflow: visible;
        display: flex;
        align-items: flex-start;
        justify-content: flex-start;
        border-radius: 3px;
        transition: color 0.15s ease, background-color 0.15s ease;
        user-select: text;
        -webkit-user-select: text;

        /* Reset any inherited font styles from the page */
        font-family: "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN",
          "Yu Gothic", "Meiryo", sans-serif;
        font-weight: normal;
        font-style: normal;
        text-decoration: none;
        letter-spacing: 0;
        text-indent: 0;
        text-align: start;
        white-space: pre-wrap;
        word-break: break-all;
      }

      .owoweb-textbox:hover,
      .owoweb-textbox:active {
        /* On hover / tap: show the text with a semi-transparent backdrop */
        color: transparent;
        background-color: rgba(0, 0, 0, 0.65);
      }

      .owoweb-textbox:hover .owoweb-textbox-content,
      .owoweb-textbox:active .owoweb-textbox-content {
        color: white;
      }

      .owoweb-textbox-content {
        color: transparent;
        transition: color 0.15s ease;
        /* Ensure Yomitan and other extensions can hook into the text */
        pointer-events: auto;
      }

      /* When a user selects text, make it visible even if not hovering */
      .owoweb-textbox ::selection {
        background: rgba(66, 133, 244, 0.45);
        color: white;
      }

      /* ── Anki toast ─────────────────────────────────────────────── */

      .owoweb-anki-toast {
        position: absolute;
        bottom: 8px;
        right: 8px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        font-family: Inter, system-ui, sans-serif;
        border-radius: 6px;
        pointer-events: none;
        z-index: 1000000;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
        animation: owoweb-toast-in 0.2s ease;
      }

      @keyframes owoweb-toast-in {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .owoweb-anki-toast-info {
        color: #e0e7ff;
        background: rgba(30, 30, 60, 0.85);
      }

      .owoweb-anki-toast-success {
        color: #34d399;
        background: rgba(10, 40, 30, 0.9);
      }

      .owoweb-anki-toast-error {
        color: #f87171;
        background: rgba(50, 10, 10, 0.9);
        max-width: 260px;
        word-break: break-word;
      }
    `}</style>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function createWebSocket(settings: OwocrSettings): WebSocket | null {
  try {
    return new WebSocket(settings.websocketUrl)
  } catch (err) {
    console.error("Could not create WebSocket:", err)
    return null
  }
}
