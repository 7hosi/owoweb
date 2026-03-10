import { AnkiConnectSettings } from "~/utils/settings"

// ── AnkiConnect v6 API ────────────────────────────────────────────────────────

type AnkiConnectRequest = {
  action: string
  version: 6
  params?: Record<string, unknown>
}

type AnkiConnectResponse<T = unknown> = {
  result: T
  error: string | null
}

async function invoke<T = unknown>(
  url: string,
  action: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const body: AnkiConnectRequest = { action, version: 6 }
  if (params) body.params = params

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const json = (await response.json()) as AnkiConnectResponse<T>
  if (json.error) {
    throw new Error(`AnkiConnect error: ${json.error}`)
  }
  return json.result
}

/** Get a list of all model (note type) names. */
export async function getModelNames(url: string): Promise<string[]> {
  return invoke<string[]>(url, "modelNames")
}

/** Get the field names for a given model. */
export async function getModelFieldNames(url: string, modelName: string): Promise<string[]> {
  return invoke<string[]>(url, "modelFieldNames", { modelName })
}

/**
 * Find the most recently created note.
 * Returns the note ID, or null if no notes exist.
 */
export async function findLatestNoteId(url: string): Promise<number | null> {
  const noteIds = await invoke<number[]>(url, "findNotes", { query: "added:1" })
  if (noteIds.length === 0) return null
  // The highest ID is the most recently created
  return Math.max(...noteIds)
}

/**
 * Get info for a list of note IDs.
 */
export async function notesInfo(
  url: string,
  noteIds: number[],
): Promise<
  {
    noteId: number
    modelName: string
    fields: Record<string, { value: string; order: number }>
  }[]
> {
  return invoke(url, "notesInfo", { notes: noteIds })
}

/**
 * Update a note's fields. Only the fields specified will be changed.
 */
export async function updateNoteFields(
  url: string,
  noteId: number,
  fields: Record<string, string>,
): Promise<void> {
  await invoke(url, "updateNoteFields", {
    note: { id: noteId, fields },
  })
}

/**
 * Store a media file in Anki's media folder.
 * @param filename - desired filename, e.g. "owoweb_1234.png"
 * @param dataBase64 - the file content as a base64 string
 * @returns the filename that Anki stored it as
 */
export async function storeMediaFile(
  url: string,
  filename: string,
  dataBase64: string,
): Promise<string> {
  return invoke<string>(url, "storeMediaFile", {
    filename,
    data: dataBase64,
  })
}

/**
 * High-level helper: store an image and update the latest card's picture field.
 */
export async function addImageToLatestNote(
  settings: AnkiConnectSettings,
  imageData: ArrayBuffer,
): Promise<{ noteId: number; filename: string }> {
  const { ankiConnectUrl, noteType, pictureField } = settings

  if (!noteType || !pictureField) {
    throw new Error("AnkiConnect note type and picture field must be configured in settings.")
  }

  // 1. Find the latest note
  const latestId = await findLatestNoteId(ankiConnectUrl)
  if (latestId === null) {
    throw new Error("No recently added notes found in Anki.")
  }

  // 2. Verify the note is the expected type
  const [noteInfo] = await notesInfo(ankiConnectUrl, [latestId])
  if (noteInfo.modelName !== noteType) {
    throw new Error(
      `Latest note is "${noteInfo.modelName}", but expected "${noteType}". ` +
        `Create a new "${noteType}" card in Anki first.`,
    )
  }

  // 3. Store the image as media
  const filename = `owoweb_${Date.now()}.png`
  const base64 = arrayBufferToBase64(imageData)
  const storedFilename = await storeMediaFile(ankiConnectUrl, filename, base64)

  // 4. Update the note field with an <img> tag
  const imgTag = `<img src="${storedFilename}">`
  const currentValue = noteInfo.fields[pictureField]?.value ?? ""
  const newValue = currentValue ? `${currentValue}${imgTag}` : imgTag

  await updateNoteFields(ankiConnectUrl, latestId, { [pictureField]: newValue })

  return { noteId: latestId, filename: storedFilename }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
