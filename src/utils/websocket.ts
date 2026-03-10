import { createSignal } from "solid-js"
import { owocrSettingsStore } from "~/utils/storage"
import { OwocrSettings } from "~/utils/settings"

const [owocrSettings, setOwocrSettings] = createSignal<OwocrSettings | null>(null)
const [socket, setSocket] = createSignal<WebSocket | null>(null)

owocrSettingsStore
  .getValue()
  .then((settings) => {
    setOwocrSettings(settings)
  })
  .finally(() => {
    // Start watching for changes to the settings.
    owocrSettingsStore.watch((newSettings, _oldSettings) => {
      setOwocrSettings(newSettings)
    })
  })

// createEffect(function refreshSocket() {
//   const currentSettings = owocrSettings()

//   // Close the running socket if there is one so that we don't have multiple
//   // sockets on at the same time.
//   closeSocket()

//   if (!currentSettings) {
//     // Since we don't have settings loaded, don't create a websocket yet.
//     return
//   }

//   const ws = createSocket(currentSettings)
//   setSocket(ws)
// })

// function closeSocket() {
//   const ws = socket()
//   if (!ws) {
//     return
//   }
//   try {
//     ws.close()
//   } catch (error) {
//     console.warn("Could not close WebSocket:", error)
//   }
//   setSocket(null)
// }

function createSocket(settings: OwocrSettings): WebSocket {
  const newWs = new WebSocket(settings.websocketUrl)
  return newWs
}

export { owocrSettings, socket }
