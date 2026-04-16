'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { supabase } from '../../lib/supabase'

export default function ClassPage() {
  const params = useParams()
  const courseId = params.id
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [script, setScript] = useState<any>(null)
  const [currentSegment, setCurrentSegment] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [renderedEquation, setRenderedEquation] = useState('')
  const [loadingAudio, setLoadingAudio] = useState(false)
  const [showQuestion, setShowQuestion] = useState(false)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [checkLoading, setCheckLoading] = useState(false)
  const [checkResult, setCheckResult] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [questionStartTime, setQuestionStartTime] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })

    supabase
      .from('courses')
      .select('script, title')
      .eq('id', courseId)
      .single()
      .then(({ data }) => {
        if (data?.script) setScript(data.script)
        setLoading(false)
      })
  }, [courseId])

  const isLatex = (str: string) => str.includes('\\') || str.includes('^') || str.includes('_')

  const drawOnCanvas = (text: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (isLatex(text)) {
      try {
        const rendered = katex.renderToString(text, { throwOnError: false })
        setRenderedEquation(rendered)
        return
      } catch {}
    }

    setRenderedEquation('')

    ctx.fillStyle = '#1a2f1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    let i = 0
    const interval = setInterval(() => {
      if (i >= text.length) {
        clearInterval(interval)
        return
      }

      ctx.fillStyle = '#1a2f1a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.strokeStyle = 'rgba(255,255,255,0.03)'
      ctx.lineWidth = 1
      for (let y = 0; y < canvas.height; y += 28) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 3
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8)

      ctx.fillStyle = '#f5e642'
      ctx.font = '24px "Segoe Print", "Comic Sans MS", cursive'
      ctx.shadowColor = 'rgba(245, 230, 66, 0.3)'
      ctx.shadowBlur = 4

      const words = text.slice(0, i + 1).split(' ')
      const maxWidth = canvas.width - 80
      let line = ''
      let y = 90

      for (const word of words) {
        const testLine = line + word + ' '
        const metrics = ctx.measureText(testLine)
        if (metrics.width > maxWidth && line !== '') {
          ctx.fillText(line, 40, y)
          line = word + ' '
          y += 42
        } else {
          line = testLine
        }
      }
      ctx.fillText(line, 40, y)
      ctx.shadowBlur = 0

      i++
    }, 25)
  }

  const playSegment = async (index: number) => {
    const seg = script?.segmentos[index]
    if (!seg) return

    setCurrentSegment(index)
    setShowQuestion(false)
    setAnswer('')
    setCheckResult(null)
    setLoadingAudio(true)

    drawOnCanvas(seg.pizarra)

    const res = await fetch('/api/text-to-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: seg.narracion,
        segmentId: `course-${courseId}-seg-${index}`
      })
    })
    const data = await res.json()
    setLoadingAudio(false)

    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(data.url)
    audioRef.current = audio
    setIsPlaying(true)
    audio.play()
    audio.onended = () => {
      setIsPlaying(false)
      setShowQuestion(true)
      setQuestionStartTime(Date.now())
    }
  }

  const checkAnswer = async () => {
    const seg = script?.segmentos[currentSegment]
    if (!seg || !answer.trim()) return

    const timeToAnswer = questionStartTime
      ? Math.round((Date.now() - questionStartTime) / 1000)
      : null

    setCheckLoading(true)
    const res = await fetch('/api/check-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: seg.pregunta_check,
        answer: answer,
        concept: seg.concepto,
        narration: seg.narracion,
        userId,
        courseId,
        segmentIndex: currentSegment,
        timeToAnswer
      })
    })
    const data = await res.json()
    setCheckResult(data)
    setCheckLoading(false)
  }

  const nextSegment = () => {
    const next = currentSegment + 1
    if (next < script?.segmentos?.length) {
      playSegment(next)
    } else {
      setShowQuestion(false)
    }
  }

  if (loading) return (
    <div style={{ padding: "40px" }}>
      <p style={{ color: "#8b92a5" }}>⏳ Cargando tu clase...</p>
    </div>
  )

  if (!script) return (
    <div style={{ padding: "40px" }}>
      <p style={{ color: "#ff4d6d" }}>❌ No se encontró la clase.</p>
    </div>
  )

  return (
    <div style={{
      minHeight: "100vh",
      padding: "40px",
      maxWidth: "800px",
      margin: "0 auto"
    }}>
      <a href="/dashboard" style={{ color: "#4285F4", fontSize: "0.85rem", textDecoration: "none" }}>
        ← Volver al dashboard
      </a>

      <h1 style={{ marginTop: "24px", marginBottom: "8px" }}>📖 {script.titulo}</h1>
      <p style={{ color: "#8b92a5", marginBottom: "24px" }}>
        Segmento {currentSegment + 1} de {script.segmentos?.length}:{' '}
        <strong style={{ color: "#e8eaf0" }}>{script.segmentos[currentSegment]?.concepto}</strong>
      </p>

      {!renderedEquation ? (
        <canvas
          ref={canvasRef}
          width={740}
          height={360}
          style={{
            borderRadius: "8px",
            border: "3px solid #2d4a2d",
            width: "100%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
          }}
        />
      ) : (
        <div style={{
          background: "#1a2f1a",
          border: "3px solid #2d4a2d",
          borderRadius: "8px",
          padding: "40px",
          minHeight: "200px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
        }}>
          <div
            style={{ color: "#f5e642", fontSize: "2.5rem" }}
            dangerouslySetInnerHTML={{ __html: renderedEquation }}
          />
        </div>
      )}

      <div style={{ marginTop: "20px", display: "flex", gap: "12px", alignItems: "center" }}>
        <button
          onClick={() => playSegment(currentSegment)}
          disabled={isPlaying || loadingAudio}
          style={{
            padding: "12px 24px",
            background: isPlaying || loadingAudio ? "#252a38" : "#4285F4",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: isPlaying || loadingAudio ? "not-allowed" : "pointer",
            fontWeight: 700
          }}
        >
          {loadingAudio ? "⏳ Cargando audio..." : isPlaying ? "🔊 Reproduciendo..." : "▶ Reproducir"}
        </button>

        {!isPlaying && !loadingAudio && !showQuestion && currentSegment < script.segmentos.length - 1 && (
          <button
            onClick={nextSegment}
            style={{
              padding: "12px 24px",
              background: "#181c26",
              color: "#e8eaf0",
              border: "1px solid #252a38",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 700
            }}
          >
            Siguiente →
          </button>
        )}
      </div>

      {showQuestion && (
        <div style={{
          marginTop: "24px",
          padding: "20px",
          background: "#181c26",
          borderRadius: "12px",
          border: `1px solid ${checkResult ? (checkResult.correcto ? '#22d98a' : '#ff4d6d') : '#ffd166'}`
        }}>
          <p style={{ color: "#ffd166", fontWeight: 700, marginBottom: "12px" }}>
            ❓ {script.segmentos[currentSegment]?.pregunta_check}
          </p>

          {!checkResult ? (
            <>
              <input
                type="text"
                placeholder="Tu respuesta..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && checkAnswer()}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #252a38",
                  background: "#0f1117",
                  color: "#e8eaf0",
                  fontSize: "0.9rem",
                  marginBottom: "10px"
                }}
              />
              <button
                onClick={checkAnswer}
                disabled={checkLoading || !answer.trim()}
                style={{
                  padding: "10px 20px",
                  background: checkLoading || !answer.trim() ? "#252a38" : "#4285F4",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: checkLoading || !answer.trim() ? "not-allowed" : "pointer",
                  fontWeight: 700
                }}
              >
                {checkLoading ? "⏳ Evaluando..." : "Verificar respuesta"}
              </button>
            </>
          ) : (
            <div>
              <p style={{
                color: checkResult.correcto ? "#22d98a" : "#ff4d6d",
                fontWeight: 700,
                marginBottom: "12px",
                fontSize: "1.1rem"
              }}>
                {checkResult.correcto ? "✅ ¡Correcto!" : "❌ No del todo..."}
              </p>
              <p style={{ color: "#e8eaf0", marginBottom: "16px", fontSize: "0.9rem" }}>
                {checkResult.feedback}
              </p>

              {!checkResult.correcto && checkResult.reexplicacion_narracion && (
                <div style={{ marginBottom: "16px" }}>
                  <p style={{ color: "#4285F4", fontSize: "0.75rem", marginBottom: "8px" }}>
                    🔄 RE-EXPLICACIÓN
                  </p>
                  <button
                    onClick={async () => {
                      drawOnCanvas(checkResult.reexplicacion_pizarra || checkResult.reexplicacion_narracion)
                      const res = await fetch('/api/text-to-speech', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          text: checkResult.reexplicacion_narracion,
                          segmentId: `reex-${courseId}-seg-${currentSegment}-${Date.now()}`
                        })
                      })
                      const data = await res.json()
                      const audio = new Audio(data.url)
                      audio.play()
                    }}
                    style={{
                      padding: "10px 20px",
                      background: "#4285F4",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: "0.85rem"
                    }}
                  >
                    🔄 Ver y escuchar re-explicación
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: "10px" }}>
                {!checkResult.correcto && (
                  <button
                    onClick={() => { setCheckResult(null); setAnswer('') }}
                    style={{
                      padding: "10px 20px",
                      background: "#181c26",
                      color: "#e8eaf0",
                      border: "1px solid #252a38",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontWeight: 700
                    }}
                  >
                    Intentar de nuevo
                  </button>
                )}
                <button
                  onClick={() => { setCheckResult(null); nextSegment() }}
                  style={{
                    padding: "10px 20px",
                    background: "#22d98a",
                    color: "#000",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: 700
                  }}
                >
                  {checkResult.correcto ? "Continuar →" : "Continuar de todas formas →"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}