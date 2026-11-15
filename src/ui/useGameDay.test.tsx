// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameDay } from './useGameDay'

function Today() {
  return <p>{useGameDay()}</p>
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Cierre del día con la app abierta', () => {
  it('el día de juego cambia solo al pasar las 4:00 a. m., sin recargar', () => {
    vi.setSystemTime(new Date(2026, 10, 15, 3, 59, 20))
    render(<Today />)
    expect(screen.getByText('2026-11-14')).toBeTruthy()

    // Medio minuto después ya son las 4:00: la app abierta pasa al día nuevo.
    act(() => void vi.advanceTimersByTime(60_000))
    expect(screen.getByText('2026-11-15')).toBeTruthy()
  })

  it('antes de las 4:00 a. m. sigue siendo el día anterior aunque pase la medianoche', () => {
    vi.setSystemTime(new Date(2026, 10, 14, 23, 59, 40))
    render(<Today />)
    act(() => void vi.advanceTimersByTime(90_000))
    expect(screen.getByText('2026-11-14')).toBeTruthy()
  })

  it('al volver a la app tras horas en segundo plano se pone al día de inmediato', () => {
    vi.setSystemTime(new Date(2026, 10, 14, 22, 0))
    render(<Today />)
    vi.setSystemTime(new Date(2026, 10, 15, 9, 0))
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.getByText('2026-11-15')).toBeTruthy()
  })
})
