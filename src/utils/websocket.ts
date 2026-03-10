import { type Accessor, createSignal } from "solid-js"
import { owocrSettingsStore } from "~/utils/storage"
import { OwocrSettings } from "~/utils/settings"

type Ws = WebSocket | null

const [owocrSettings, setOwocrSettings] = createSignal<OwocrSettings | null>(null)
const [socket, setSocket] = createSignal<Ws>(null)

owocrSettingsStore
  .getValue()
  .then((settings) => {
    setOwocrSettings(settings)
  })
  .finally(() => {
    // Start watching for changes of the settings.
    owocrSettingsStore.watch((newSettings, _oldSettings) => {
      setOwocrSettings(newSettings)
    })
  })

createEffect(function refreshSocket() {
  const currentSettings = owocrSettings()

  if (!currentSettings) {
    // Since we don't have settings loaded, don't create a websocket yet.
    // As a sanity check, make sure no socket connection is open.
    closeSocket()
    return
  }

  const ws = createSocket(currentSettings)
  setSocket(ws)
})

function closeSocket() {
  const ws = socket()
  if (!ws) {
    return
  }
  try {
    ws.close()
  } catch (error) {
    console.warn("Could not close WebSocket:", error)
  }
}

function createSocket(settings: OwocrSettings): Ws {
  try {
    const newWs = new WebSocket(settings.websocketUrl)
    return newWs
  } catch (err) {
    console.error("Could not create WebSocket:", err)
    return null
  }
}
