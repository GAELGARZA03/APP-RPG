import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AiError, checkConnection, GEMINI_KEY_SECRET } from '../../ai/gemini'
import { DEFAULT_FAST_MODEL, DEFAULT_MAIN_MODEL } from '../../ai/models'
import { db } from '../../data/appDb'
import { getAiSettings, saveAiModels } from '../../data/settings'
import { httpRequest } from '../../platform/http'
import { getSecret, removeSecret, secretsPersist, setSecret } from '../../platform/secrets'
import { Badge } from '../kit/Badge'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'
import { Field, Input } from '../kit/controls'

export function GeminiPanel({ embedded, headingId }: { embedded?: boolean; headingId?: string } = {}) {
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
    setMessage({ error: false, text: 'Probando los dos modelos…' })
    // Se prueban los dos por separado: uno puede estar saturado o sin permiso y el otro no.
    const results: string[] = []
    let failed = false
    for (const [label, model] of [
      ['Rápido', aiSettings.fastModel],
      ['Principal', aiSettings.mainModel],
    ]) {
      try {
        await checkConnection(httpRequest, { apiKey: key, model })
        results.push(`${label} (${model}): conexión correcta.`)
      } catch (error) {
        failed = true
        results.push(`${label} (${model}): ${error instanceof AiError ? error.message : 'no se pudo conectar.'}`)
      }
    }
    setMessage({ error: failed, text: results.join(' ') })
  }

  if (hasKey === null || !aiSettings) return null

  return (
    <Card
      embedded={embedded}
      headingId={headingId}
      label="Gemini (IA)"
      icon={Sparkles}
      action={
        hasKey ? (
          <Badge tone="signal">
            <Check aria-hidden />
            Llave guardada
          </Badge>
        ) : (
          <Badge tone="ember">Sin llave</Badge>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label={hasKey ? 'Reemplazar API key' : 'Pega tu API key'}
          hint={
            <>
              Créala gratis en{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-signal underline">
                aistudio.google.com/apikey
              </a>
              .{' '}
              {secretsPersist
                ? 'Se guarda cifrada en este teléfono y nunca entra en tus respaldos.'
                : 'En el navegador solo dura mientras la pestaña esté abierta.'}
            </>
          }
        >
          <Input
            type="password"
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void saveKey()}>
            Guardar llave
          </Button>
          {hasKey && (
            <Button size="sm" onClick={() => void test()}>
              Probar conexión
            </Button>
          )}
          {hasKey && (
            <Button
              size="sm"
              variant={confirmingRemoval ? 'danger' : 'ghost'}
              onClick={() => (confirmingRemoval ? void removeKey() : setConfirmingRemoval(true))}
            >
              <Trash2 aria-hidden />
              {confirmingRemoval ? 'Toca otra vez para borrar' : 'Borrar llave'}
            </Button>
          )}
        </div>

        <Field
          label="Modelo principal"
          hint={`Diseña las campañas y genera cada acto, pensando a fondo. Por defecto: ${DEFAULT_MAIN_MODEL}.`}
        >
          <Input
            key={aiSettings.mainModel}
            defaultValue={aiSettings.mainModel}
            onBlur={(event) => void saveAiModels(db, { mainModel: event.target.value })}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="text-sm"
          />
        </Field>
        <Field
          label="Modelo rápido"
          hint={`Preguntas previas, detallar misiones y misión del día. Por defecto: ${DEFAULT_FAST_MODEL}.`}
        >
          <Input
            key={aiSettings.fastModel}
            defaultValue={aiSettings.fastModel}
            onBlur={(event) => void saveAiModels(db, { fastModel: event.target.value })}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="text-sm"
          />
        </Field>
        <p className="text-xs text-muted">
          Si el modelo principal falla, la app te muestra el motivo y te deja reintentar o usar el rápido: nunca cambia
          de modelo sin avisarte. En el nivel gratuito, Google puede usar lo que envías para mejorar sus productos.
        </p>

        {message && (
          <p role="status" className={`text-sm ${message.error ? 'text-ember' : 'text-signal'}`}>
            {message.text}
          </p>
        )}
      </div>
    </Card>
  )
}
