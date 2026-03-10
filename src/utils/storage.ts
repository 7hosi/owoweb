import { defaultOwocrSettings, OwocrSettings } from "~/utils/settings"

export const owocrSettingsStore = storage.defineItem<OwocrSettings>("local:owocr-settings", {
  fallback: defaultOwocrSettings,
})
