import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { AiError, checkConnection, GEMINI_KEY_SECRET } from '../../ai/gemini'
import { db } from '../../data/appDb'
import { getAiSettings, saveAiModel } from '../../data/settings'
import { httpRequest } from '../../platform/http'
import { getSecret, removeSecret, secretsPersist, setSecret } from '../../platform/secrets'
import { Panel, SmallButton } from '../parts'

export function GeminiPanel() {
  const aiSettings = useLiveQuery(() => getAiSettings(db), [])
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [draftKey, setDraftKey] = useState('')
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)

  useEffect(() => {
    getSecret(GEMINI_KEY_SECRET)
      .then((key) => setHasKey(key !== null))
      .catch(() => setHasKey(false))
  }, [])

  async function saveKey() {
    const key = draftKey.trim()
    if (!key) return
    try {
      await setSecret(GEMINI_KEY_SECRET, key)
      setDraftKey('')
      setHasKey(true)
      setMessage({ error: false, text: 'API key guardada.' })
    } catch {
      setMessage({ error: true, text: 'No se pudo guardar la API key.' })
    }
  }

  async function removeKey() {
    await removeSecret(GEMINI_KEY_SECRET)
    setHasKey(false)
    setConfirmingRemoval(false)
    setMessage({ error: false, text: 'API key borrada de este teléfono.' })
  }

  async function test() {
    const key = await getSecret(GEMINI_KEY_SECRET)
    if (!key || !aiSettings) return
    setMessage({ error: false, text: 'Probando conexión…' })
    try {
      await checkConnection(httpRequest, { apiKey: key, model: aiSettings.model })
      setMessage({ error: false, text: `Conexión correcta con ${aiSettings.model}.` })
    } catch (error) {
      setMessage({ error: true, text: error instanceof AiError ? error.message : 'No se pudo conectar.' })
    }
  }

  if (hasKey === null || !aiSettings) return null

  return (
    <Panel label="Gemini (IA)">
      <p className="mb-3 text-sm">
        API key: <span className={hasKey ? 'text-signal' : 'text-ember'}>{hasKey ? 'guardada' : 'sin configurar'}</span>
      </p>

      <label className="mb-2 flex flex-col gap-1 text-xs text-muted">
        {hasKey ? 'Reemplazar API key' : 'Pega tu API key'}
        <input
          type="password"
          value={draftKey}
          onChange={(event) => setDraftKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 rounded-md border border-line bg-void px-3 text-base text-ink outline-none focus:border-signal"
        />
      </label>
      <p className="mb-3 text-xs text-muted">
        Créala gratis en{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-signal underline">
          aistudio.google.com/apikey
        </a>
        .{' '}
        {secretsPersist
          ? 'Se guarda cifrada en este teléfono y nunca entra en tus respaldos.'
          : 'En el navegador solo dura mientras la pestaña esté abierta.'}
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <SmallButton onClick={() => void saveKey()}>Guardar llave</SmallButton>
        {hasKey && <SmallButton onClick={() => void test()}>Probar conexión</SmallButton>}
        {hasKey && (
          <button
            type="button"
            onClick={() => (confirmingRemoval ? void removeKey() : setConfirmingRemoval(true))}
            className={`min-h-9 rounded-sm border px-3 text-xs ${
              confirmingRemoval ? 'border-ember bg-ember/15 text-ember' : 'border-line text-muted'
            }`}
          >
            {confirmingRemoval ? 'Toca otra vez para borrar' : 'Borrar llave'}
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Modelo
        <input
          key={aiSettings.model}
          defaultValue={aiSettings.model}
          onBlur={(event) => void saveAiModel(db, event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 rounded-md border border-line bg-void px-3 text-sm text-ink outline-none focus:border-signal"
        />
      </label>

      {message && (
        <p role="status" className={`mt-3 text-sm ${message.error ? 'text-ember' : 'text-signal'}`}>
          {message.text}
        </p>
      )}
    </Panel>
  )
}
