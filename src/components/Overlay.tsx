import { createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js"
import { owocrSettingsStore } from "~/utils/storage"
import { OwocrSettings } from "~/utils/settings"

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

  owocrSettingsStore.getValue().then((settings) => {
    const ws = createWebSocket(settings)
    setSocket(ws)
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

      <Show when={ocrData()}>
        {(data) => (
          <For each={data().paragraphs}>
            {(paragraph) => (
              <TextBox
                paragraph={paragraph}
                containerWidth={containerSize().width}
                containerHeight={containerSize().height}
              />
            )}
          </For>
        )}
      </Show>
    </div>
  )
}

// ── TextBox Component ────────────────────────────────────────────────────────

/** Stop events from leaking through the text box to the page underneath. */
const interceptEvent = (e: Event) => {
  e.stopPropagation()
}

function TextBox(props: { paragraph: Paragraph; containerWidth: number; containerHeight: number }) {
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

  return (
    <div
      class="owoweb-textbox"
      style={{
        position: "absolute",
        left: `${leftPct()}%`,
        top: `${topPct()}%`,
        width: `${widthPct()}%`,
        height: `${heightPct()}%`,
        "writing-mode": isVertical() ? "vertical-rl" : "horizontal-tb",
        "font-size": `${fontSize()}px`,
        "line-height": "1.2",
        "pointer-events": "auto",
      }}
      // Intercept all interaction events so the underlying page doesn't
      // react while the user is selecting text, using Yomitan, etc.
      onClick={interceptEvent}
      onMouseDown={interceptEvent}
      onMouseUp={interceptEvent}
      onPointerDown={interceptEvent}
      onPointerUp={interceptEvent}
      onContextMenu={interceptEvent}
      onDblClick={interceptEvent}
      onMouseMove={interceptEvent}
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
