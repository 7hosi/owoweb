import { createSignal, createEffect, onMount, For, Show } from "solid-js"
import { owocrSettingsStore, ankiConnectSettingsStore } from "~/utils/storage"
import { getModelNames, getModelFieldNames } from "~/utils/ankiconnect"
import "./App.css"

function App() {
  // ── owocr settings ──────────────────────────────────────────────────────────
  const [wsUrl, setWsUrl] = createSignal("")

  // ── AnkiConnect settings ────────────────────────────────────────────────────
  const [ankiUrl, setAnkiUrl] = createSignal("")
  const [noteType, setNoteType] = createSignal("")
  const [pictureField, setPictureField] = createSignal("")

  // ── Model / field lists fetched from Anki ───────────────────────────────────
  const [modelNames, setModelNames] = createSignal<string[]>([])
  const [fieldNames, setFieldNames] = createSignal<string[]>([])
  const [ankiStatus, setAnkiStatus] = createSignal<"idle" | "loading" | "ok" | "error">("idle")
  const [ankiError, setAnkiError] = createSignal("")

  // ── Save feedback ───────────────────────────────────────────────────────────
  const [saved, setSaved] = createSignal(false)

  // Load saved settings on mount
  onMount(async () => {
    const owocr = await owocrSettingsStore.getValue()
    setWsUrl(owocr.websocketUrl)

    const anki = await ankiConnectSettingsStore.getValue()
    setAnkiUrl(anki.ankiConnectUrl)
    setNoteType(anki.noteType)
    setPictureField(anki.pictureField)
  })

  // Fetch model names whenever the AnkiConnect URL changes
  async function fetchModels() {
    const url = ankiUrl()
    if (!url) return

    setAnkiStatus("loading")
    setAnkiError("")
    try {
      const models = await getModelNames(url)
      setModelNames(models)
      setAnkiStatus("ok")

      // If the previously saved noteType still exists, keep it; otherwise clear
      if (noteType() && !models.includes(noteType())) {
        setNoteType("")
        setFieldNames([])
        setPictureField("")
      } else if (noteType()) {
        await fetchFields(noteType())
      }
    } catch (err) {
      setAnkiStatus("error")
      setAnkiError(err instanceof Error ? err.message : String(err))
      setModelNames([])
      setFieldNames([])
    }
  }

  // Fetch field names whenever the note type changes
  async function fetchFields(model: string) {
    if (!model || !ankiUrl()) return
    try {
      const fields = await getModelFieldNames(ankiUrl(), model)
      setFieldNames(fields)
      if (pictureField() && !fields.includes(pictureField())) {
        setPictureField("")
      }
    } catch {
      setFieldNames([])
    }
  }

  // Save all settings
  async function handleSave() {
    await owocrSettingsStore.setValue({ websocketUrl: wsUrl() })
    await ankiConnectSettingsStore.setValue({
      ankiConnectUrl: ankiUrl(),
      noteType: noteType(),
      pictureField: pictureField(),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div class="settings-container">
      <h1 class="settings-title">owoweb</h1>

      {/* ── owocr section ──────────────────────────────────────────── */}
      <section class="settings-section">
        <h2 class="section-heading">owocr</h2>
        <label class="field-label" for="ws-url">
          WebSocket URL
        </label>
        <input
          id="ws-url"
          class="field-input"
          type="text"
          placeholder="ws://localhost:7331"
          value={wsUrl()}
          onInput={(e) => setWsUrl(e.currentTarget.value)}
        />
      </section>

      {/* ── AnkiConnect section ────────────────────────────────────── */}
      <section class="settings-section">
        <h2 class="section-heading">AnkiConnect</h2>

        <label class="field-label" for="anki-url">
          AnkiConnect URL
        </label>
        <div class="input-row">
          <input
            id="anki-url"
            class="field-input"
            type="text"
            placeholder="http://127.0.0.1:8765"
            value={ankiUrl()}
            onInput={(e) => setAnkiUrl(e.currentTarget.value)}
          />
          <button class="btn-connect" onClick={fetchModels} disabled={ankiStatus() === "loading"}>
            {ankiStatus() === "loading" ? "…" : "Connect"}
          </button>
        </div>

        <Show when={ankiStatus() === "error"}>
          <p class="status-error">{ankiError()}</p>
        </Show>
        <Show when={ankiStatus() === "ok"}>
          <p class="status-ok">Connected to Anki ✓</p>
        </Show>

        <Show when={modelNames().length > 0}>
          <label class="field-label" for="note-type">
            Note Type
          </label>
          <select
            id="note-type"
            class="field-select"
            value={noteType()}
            onChange={async (e) => {
              const model = e.currentTarget.value
              setNoteType(model)
              setPictureField("")
              await fetchFields(model)
            }}
          >
            <option value="">— select —</option>
            <For each={modelNames()}>{(name) => <option value={name}>{name}</option>}</For>
          </select>
        </Show>

        <Show when={fieldNames().length > 0}>
          <label class="field-label" for="picture-field">
            Picture Field
          </label>
          <select
            id="picture-field"
            class="field-select"
            value={pictureField()}
            onChange={(e) => setPictureField(e.currentTarget.value)}
          >
            <option value="">— select —</option>
            <For each={fieldNames()}>{(name) => <option value={name}>{name}</option>}</For>
          </select>
        </Show>
      </section>

      {/* ── Save ───────────────────────────────────────────────────── */}
      <button class="btn-save" onClick={handleSave}>
        {saved() ? "Saved ✓" : "Save Settings"}
      </button>
    </div>
  )
}

export default App
