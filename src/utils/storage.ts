import { defaultOwocrSettings, OwocrSettings } from "~/utils/settings"
import { defaultAnkiConnectSettings, AnkiConnectSettings } from "~/utils/settings"

export const owocrSettingsStore = storage.defineItem<OwocrSettings>("local:owocr-settings", {
  fallback: defaultOwocrSettings,
})

export const ankiConnectSettingsStore = storage.defineItem<AnkiConnectSettings>(
  "local:ankiconnect-settings",
  {
    fallback: defaultAnkiConnectSettings,
  },
)
