import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Copy, Download, QrCode, RefreshCw, Upload, X } from 'lucide-react'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { decodeSyncPayload, encodeSyncPayload, mergeLibraryProgress } from './lib/syncQr.js'

export default function SyncModal({ books, onSyncApply, onClose }) {
  const [tab, setTab] = useState('show') // 'show' | 'scan'
  const [manualCode, setManualCode] = useState('')
  const [scanStatus, setScanStatus] = useState({ state: 'idle', message: '' })
  const [cameraActive, setCameraActive] = useState(false)
  const [copied, setCopied] = useState(false)

  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const animRef = useRef(null)
  const fileInputRef = useRef(null)

  const payloadString = useRef('')
  payloadString.current = encodeSyncPayload(books)

  // Render QR Code in "show" tab
  useEffect(() => {
    if (tab !== 'show' || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, payloadString.current, {
      width: 260,
      margin: 2,
      color: {
        dark: '#1c1b18',
        light: '#f5efe2',
      },
      errorCorrectionLevel: 'M',
    }).catch((err) => {
      console.error('QR code generation error:', err)
    })
  }, [tab, books])

  // Camera cleanup on unmount or tab switch
  const stopCamera = () => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  useEffect(() => {
    if (tab !== 'scan') stopCamera()
    return () => stopCamera()
  }, [tab])

  const startCamera = async () => {
    stopCamera()
    setScanStatus({ state: 'idle', message: 'Запуск камеры…' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.setAttribute('playsinline', 'true')
        await videoRef.current.play()
        setCameraActive(true)
        setScanStatus({ state: 'scanning', message: 'Наведите камеру на QR-код…' })
        scanLoop()
      }
    } catch (err) {
      console.warn('Camera access failed:', err)
      setScanStatus({
        state: 'error',
        message: 'Камера недоступна или нет разрешения. Выберите фото с QR или вставьте код.',
      })
    }
  }

  const scanLoop = () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      animRef.current = requestAnimationFrame(scanLoop)
      return
    }

    const video = videoRef.current
    const w = video.videoWidth
    const h = video.videoHeight

    if (w > 0 && h > 0) {
      const offscreen = document.createElement('canvas')
      offscreen.width = w
      offscreen.height = h
      const ctx = offscreen.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(video, 0, 0, w, h)
      const imgData = ctx.getImageData(0, 0, w, h)
      const code = jsQR(imgData.data, imgData.width, imgData.height)

      if (code && code.data) {
        handleRawData(code.data)
        return
      }
    }

    animRef.current = requestAnimationFrame(scanLoop)
  }

  const handleRawData = (raw) => {
    const parsed = decodeSyncPayload(raw)
    if (!parsed || !parsed.items.length) {
      setScanStatus({ state: 'error', message: 'Не удалось распознать код Литеры. Проверьте QR-код.' })
      return
    }

    const { updatedBooks, changedCount, updatedTitles } = mergeLibraryProgress(books, parsed)
    if (changedCount === 0) {
      stopCamera()
      setScanStatus({
        state: 'done',
        message: 'Прогресс уже актуален! Все книги синхронизированы.',
      })
      return
    }

    stopCamera()
    onSyncApply(updatedBooks, `Синхронизировано книг: ${changedCount} (${updatedTitles.slice(0, 2).join(', ')}${updatedTitles.length > 2 ? '…' : ''})`)
    setScanStatus({
      state: 'done',
      message: `Успешно обновлено книг: ${changedCount}!`,
    })
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const imgData = ctx.getImageData(0, 0, img.width, img.height)
      const code = jsQR(imgData.data, imgData.width, imgData.height)
      if (code && code.data) {
        handleRawData(code.data)
      } else {
        setScanStatus({ state: 'error', message: 'На этом изображении QR-код не найден.' })
      }
    }
    img.onerror = () => setScanStatus({ state: 'error', message: 'Не удалось загрузить изображение.' })
    img.src = URL.createObjectURL(file)
  }

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(payloadString.current)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const downloadQrImage = () => {
    if (!canvasRef.current) return
    const a = document.createElement('a')
    a.download = `litera-sync-${new Date().toISOString().slice(0, 10)}.png`
    a.href = canvasRef.current.toDataURL('image/png')
    a.click()
  }

  const activeBooksCount = books.filter((b) => b.progress > 0 || b.currentPage > 0).length

  return (
    <div className="panel-backdrop sync-modal-backdrop" onClick={onClose}>
      <div className="sync-modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sync-modal-header">
          <div>
            <small>БЕЗ СЕРВЕРОВ И ОБЛАКА</small>
            <h2>Синхронизация библиотеки</h2>
          </div>
          <button className="sync-modal-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="sync-modal-tabs">
          <button
            className={`sync-tab-btn ${tab === 'show' ? 'active' : ''}`}
            onClick={() => setTab('show')}
          >
            <QrCode size={16} /> Показать QR-код
          </button>
          <button
            className={`sync-tab-btn ${tab === 'scan' ? 'active' : ''}`}
            onClick={() => {
              setTab('scan')
              setTimeout(startCamera, 100)
            }}
          >
            <Camera size={16} /> Сканировать QR
          </button>
        </div>

        <div className="sync-modal-body">
          {tab === 'show' ? (
            <div className="sync-show-pane">
              <div className="qr-wrapper">
                <canvas ref={canvasRef} className="qr-canvas" />
              </div>
              <p className="sync-hint">
                Отсканируйте этот код камерой на другом телефоне или планшете. Прогресс чтения (страницы и проценты) для <b>{activeBooksCount}</b> {activeBooksCount === 1 ? 'книги' : 'книг'} мгновенно перенесётся.
              </p>
              <div className="sync-actions-row">
                <button className="sync-action-btn" onClick={copyPayload}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copied ? 'Скопировано!' : 'Скопировать код'}</span>
                </button>
                <button className="sync-action-btn" onClick={downloadQrImage}>
                  <Download size={15} />
                  <span>Сохранить QR-картинку</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="sync-scan-pane">
              <div className="camera-viewfinder">
                <video ref={videoRef} className="camera-video" />
                <div className="viewfinder-frame">
                  <span className="corner top-left" />
                  <span className="corner top-right" />
                  <span className="corner bottom-left" />
                  <span className="corner bottom-right" />
                  <div className="laser-line" />
                </div>
              </div>

              {scanStatus.message && (
                <div className={`scan-status-alert status-${scanStatus.state}`}>
                  {scanStatus.message}
                </div>
              )}

              <div className="scan-alternatives">
                {!cameraActive && (
                  <button className="sync-action-btn" onClick={startCamera}>
                    <RefreshCw size={15} />
                    <span>Включить камеру</span>
                  </button>
                )}
                <button
                  className="sync-action-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={15} />
                  <span>Выбрать фото QR-кода</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleFileUpload}
                />
              </div>

              <details className="manual-code-accordion">
                <summary>Или вставить текстовый код вручную</summary>
                <div className="manual-code-form">
                  <textarea
                    rows={3}
                    placeholder="Вставьте JSON-код прогрессасюда…"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                  />
                  <button
                    className="sync-action-btn"
                    disabled={!manualCode.trim()}
                    onClick={() => handleRawData(manualCode)}
                  >
                    Применить код
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
