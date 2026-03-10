import { onMount, onCleanup } from "solid-js"
// import { socket } from "~/utils/websocket"

export default function Popup(props: {
  rect: DOMRect
  tagName: string
  image: string | ArrayBufferLike | ArrayBufferView<ArrayBufferLike> | null
}) {
  const [socket, setSocket] = createSignal<WebSocket | null>(null)

  owocrSettingsStore.getValue().then((settings) => {
    const ws = createWebSocket(settings)
    setSocket(ws)
  })

  createEffect(() => {
    const ws = socket()
    if (!ws) {
      return
    }

    ws.onopen = () => {
      console.log("WebSocket opened")
      if (props.image === null) {
        console.warn("Did not receive image")
        return
      }
      ws.send(props.image)
    }

    ws.onmessage = (messageEv) => {
      console.log(messageEv)
      if (messageEv.data === "True") {
        console.log("Waiting for response")
      } else {
        console.log("Response received", messageEv.data)
        ws.close()
      }
    }

    ws.onclose = () => {
      console.log("WebSocket closed")
    }

    ws.onerror = (error) => {
      console.error("WebSocket error:", error)
    }
  })

  // Basic styling for our Solid app
  return (
    <div
      style={{
        position: "absolute",
        top: `${props.rect.top + window.scrollY}px`,
        left: `${props.rect.left + window.scrollX}px`,
        width: `${props.rect.width}px`,
        height: `${props.rect.height}px`,
        "background-color": "transparent",
        "pointer-events": "none", // Prevent overlay from blocking future clicks
        "z-index": "999999",
      }}
    >
      <div
        style={{
          padding: "16px",
          "font-family": "system-ui, -apple-system, sans-serif",
          color: "white", // High contrast so text is readable over image
          "text-shadow": "1px 1px 4px black",
        }}
      >
        <div style={{ "font-weight": "bold", "margin-bottom": "8px" }}>OWOCR Overlay</div>
        <div style={{ "font-size": "14px", "margin-bottom": "8px" }}>
          Target: <code>{props.tagName}</code>
        </div>
        {/* <div
          style={{
            "font-size": "13px",
            color: wsStatus().includes("Connected")
              ? "#4ade80" // lighter green for dark/transparent backgrounds
              : wsStatus().includes("error") || wsStatus().includes("Failed")
                ? "#f87171" // lighter red
                : "#facc15", // lighter yellow
          }}
        >
          {wsStatus()}
        </div> */}
      </div>
    </div>
  )
}

function createWebSocket(settings: OwocrSettings): WebSocket | null {
  try {
    const ws = new WebSocket(settings.websocketUrl)
    return ws
  } catch (err) {
    console.error("Could not create WebSocket:", err)
    return null
  }
}
