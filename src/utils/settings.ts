export type OwocrSettings = {
  websocketUrl: string
}

export const defaultOwocrSettings: OwocrSettings = {
  websocketUrl: "ws://localhost:7331",
}

export type AnkiConnectSettings = {
  ankiConnectUrl: string
  noteType: string
  pictureField: string
}

export const defaultAnkiConnectSettings: AnkiConnectSettings = {
  ankiConnectUrl: "http://127.0.0.1:8765",
  noteType: "",
  pictureField: "",
}
