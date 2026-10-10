import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  Check,
  Clipboard,
  Copy,
  Download,
  FileDown,
  FileUp,
  FolderArchive,
  Link as LinkIcon,
  QrCode,
  RefreshCw,
  Share2,
  Upload,
  X,
} from 'lucide-react'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import {
  decodeSyncPayload,
  encodeSyncPayload,
  generateSyncUrl,
  mergeLibraryProgress,
} from './lib/syncQr.js'
import {
  exportLibraryBundle,
  importLibraryBundle,
} from './lib/libraryBackup.js'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.download = filename
  a.href = url
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function SyncModal({ books, onSyncApply, onLibraryImport, onClose }) {
  // Tabs: 'backup' (Full library .litera) | 'link' (Direct link / code) | 'qr' (QR code & camera)
  const [tab, setTab] = useState('backup')
  const [manualCode, setManualCode] = useState('')
  const [scanStatus, setScanStatus] = useState({ state: 'idle', message: '' })
  const [backupStatus, setBackupStatus] = useState({ state: 'idle', message: '' })
  const [importMode, setImportMode] = useState('merge') // 'merge' | 'replace'
  const [cameraActive, setCameraActive] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [exporting, setExporting] = useState(false)

  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const animRef = useRef(null)
  const fileInputRef = useRef(null)
  const backupInputRef = useRef(null)

  const payloadString = useRef('')
  payloadString.current = encodeSyncPayload(books)

  const syncUrl = typeof window !== 'undefined' ? generateSyncUrl(books) : ''

  // Render QR Code in "qr" tab
  useEffect(() => {
    if (tab !== 'qr' || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, payloadString.current, {
      width: 250,
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
    if (tab !== 'qr') stopCamera()
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
        message: 'Камера недоступна или нет разрешения. Выберите фото с QR или используйте ссылку/файл.',
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
    if (!parsed || !parsed.items?.length) {
      setScanStatus({ state: 'error', message: 'Не удалось распознать код Литеры. Проверьте код или ссылку.' })
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
    onSyncApply(
      updatedBooks,
      `Синхронизировано книг: ${changedCount} (${updatedTitles.slice(0, 2).join(', ')}${updatedTitles.length > 2 ? '…' : ''})`
    )
    setScanStatus({
      state: 'done',
      message: `Успешно обновлено книг: ${changedCount}!`,
    })
  }

  const handleQrPhotoUpload = (e) => {
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
        setScanStatus({ state: 'error', message: 'На этом фото QR-код не найден.' })
      }
    }
    img.onerror = () => setScanStatus({ state: 'error', message: 'Не удалось загрузить изображение.' })
    img.src = URL.createObjectURL(file)
  }

  // File Sharing / Export for .litera
  const handleShareLibraryFile = async () => {
    try {
      setExporting(true)
      const json = await exportLibraryBundle(books)
      const blob = new Blob([json], { type: 'application/json' })
      const fileName = `litera-library-${new Date().toISOString().slice(0, 10)}.litera`
      const file = new File([blob], fileName, { type: 'application/json' })

      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Библиотека Литера',
          text: `Резервная копия библиотеки Литера (${books.length} книг)`,
          files: [file],
        })
      } else {
        downloadBlob(blob, fileName)
        setBackupStatus({
          state: 'done',
          message: 'Файл библиотеки скачан. Отправьте его себе в Telegram или перенесите на ПК.',
        })
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Share library error:', err)
        setBackupStatus({ state: 'error', message: 'Не удалось поделиться файлом' })
      }
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadLibraryFile = async () => {
    try {
      setExporting(true)
      const json = await exportLibraryBundle(books)
      const blob = new Blob([json], { type: 'application/json' })
      const fileName = `litera-library-${new Date().toISOString().slice(0, 10)}.litera`
      downloadBlob(blob, fileName)
      setBackupStatus({
        state: 'done',
        message: 'Файл библиотеки (.litera) успешно сохранён!',
      })
    } catch (err) {
      console.warn('Download library error:', err)
      setBackupStatus({ state: 'error', message: 'Не удалось экспортировать библиотеку' })
    } finally {
      setExporting(false)
    }
  }

  const handleImportBackupFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setBackupStatus({ state: 'idle', message: 'Восстановление библиотеки…' })
      const text = await file.text()
      const result = await importLibraryBundle(text, books, importMode)
      if (onLibraryImport) {
        onLibraryImport(
          result.books,
          `Библиотека обновлена: +${result.addedCount} новых книг, обновлено ${result.updatedCount}`
        )
      } else {
        onSyncApply(
          result.books,
          `Библиотека обновлена: +${result.addedCount} новых книг, обновлено ${result.updatedCount}`
        )
      }
      setBackupStatus({
        state: 'done',
        message: `Успешно! Добавлено книг: ${result.addedCount}, обновлено: ${result.updatedCount}. Всего на полке: ${result.totalCount}.`,
      })
    } catch (err) {
      setBackupStatus({
        state: 'error',
        message: err.message || 'Ошибка чтения файла библиотеки. Проверьте формат .litera/.json.',
      })
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = ''
    }
  }

  // Link & Code sharing
  const handleShareLink = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Синхронизация Литера',
          text: `Синхронизация прогресса чтения Литера (${books.length} книг)`,
          url: syncUrl,
        })
        return
      } catch (err) {
        if (err.name === 'AbortError') return
      }
    }
    // Fallback: copy link
    copySyncLink()
  }

  const copySyncLink = async () => {
    try {
      await navigator.clipboard.writeText(syncUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2200)
    } catch {
      /* ignore */
    }
  }

  const copySyncCode = async () => {
    try {
      await navigator.clipboard.writeText(payloadString.current)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2200)
    } catch {
      /* ignore */
    }
  }

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setManualCode(text.trim())
        handleRawData(text.trim())
      }
    } catch (err) {
      setScanStatus({
        state: 'error',
        message: 'Не удалось получить доступ к буферу. Вставьте ссылку или код в поле вручную (Ctrl+V).',
      })
    }
  }

  const activeBooksCount = books.filter((b) => b.progress > 0 || b.currentPage > 0).length

  return (
    <div className="panel-backdrop sync-modal-backdrop" onClick={onClose}>
      <div className="sync-modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sync-modal-header">
          <div>
            <small>БЕЗ СЕРВЕРОВ И ОБЛАКА · ЛОКАЛЬНО</small>
            <h2>Синхронизация и перенос</h2>
          </div>
          <button className="sync-modal-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="sync-modal-tabs">
          <button
            className={`sync-tab-btn ${tab === 'backup' ? 'active' : ''}`}
            onClick={() => setTab('backup')}
            title="Перенос книг с телефона на ПК"
          >
            <FolderArchive size={15} /> Файл библиотеки (.litera)
          </button>
          <button
            className={`sync-tab-btn ${tab === 'link' ? 'active' : ''}`}
            onClick={() => setTab('link')}
            title="Синхронизация через прямую ссылку или код"
          >
            <LinkIcon size={15} /> Ссылка и код
          </button>
          <button
            className={`sync-tab-btn ${tab === 'qr' ? 'active' : ''}`}
            onClick={() => {
              setTab('qr')
              setTimeout(startCamera, 100)
            }}
            title="QR-код и сканер камеры"
          >
            <QrCode size={15} /> QR-код
          </button>
        </div>

        <div className="sync-modal-body">
          {tab === 'backup' && (
            <div className="sync-tab-pane">
              <p className="sync-hint">
                <b>Перенос всей библиотеки:</b> скопируйте книги, тексты, обложки, заметки и прогресс с одного устройства на другое. Идеально, если книги есть на телефоне, а на ПК их нет.
              </p>

              <div className="sync-cards-grid">
                {/* Export Card */}
                <div className="sync-card">
                  <div className="sync-card-head">
                    <FileDown size={18} />
                    <div>
                      <b>1. С телефона: экспортировать</b>
                      <small>{books.length} книг на полке</small>
                    </div>
                  </div>
                  <div className="sync-card-actions">
                    <button
                      className="sync-action-btn primary"
                      disabled={exporting}
                      onClick={handleShareLibraryFile}
                    >
                      <Share2 size={15} />
                      <span>{exporting ? 'Подготовка…' : 'Поделиться файлом'}</span>
                    </button>
                    <button
                      className="sync-action-btn"
                      disabled={exporting}
                      onClick={handleDownloadLibraryFile}
                    >
                      <Download size={15} />
                      <span>Скачать .litera</span>
                    </button>
                  </div>
                  <span className="sync-subhint">
                    Отправьте файл себе в Telegram «Избранное», WhatsApp или сохраните на диск.
                  </span>
                </div>

                {/* Import Card */}
                <div className="sync-card">
                  <div className="sync-card-head">
                    <FileUp size={18} />
                    <div>
                      <b>2. На ПК: импортировать</b>
                      <small>Файл .litera или .json</small>
                    </div>
                  </div>

                  <div className="sync-mode-selector">
                    <label>
                      <input
                        type="radio"
                        name="importMode"
                        value="merge"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                      />
                      <span>Объединить (добавить недостающие)</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                      />
                      <span>Заменить библиотеку</span>
                    </label>
                  </div>

                  <div className="sync-card-actions">
                    <button
                      className="sync-action-btn primary"
                      onClick={() => backupInputRef.current?.click()}
                    >
                      <Upload size={15} />
                      <span>Выбрать файл .litera</span>
                    </button>
                    <input
                      ref={backupInputRef}
                      type="file"
                      accept=".litera,.json,application/json"
                      hidden
                      onChange={handleImportBackupFile}
                    />
                  </div>
                  <span className="sync-subhint">
                    Также можно просто перетащить файл .litera мышкой прямо на окно приложения.
                  </span>
                </div>
              </div>

              {backupStatus.message && (
                <div className={`scan-status-alert status-${backupStatus.state}`}>
                  {backupStatus.message}
                </div>
              )}
            </div>
          )}

          {tab === 'link' && (
            <div className="sync-tab-pane">
              <p className="sync-hint">
                <b>Синхронизация прогресса без камеры:</b> перенесите страницы и проценты прочитанного на компьютер без сканирования экрана.
              </p>

              <div className="sync-cards-grid">
                {/* Send Progress */}
                <div className="sync-card">
                  <div className="sync-card-head">
                    <Share2 size={18} />
                    <div>
                      <b>1. Отправить ссылку с телефона</b>
                      <small>Прогресс {activeBooksCount} активных книг</small>
                    </div>
                  </div>
                  <div className="sync-card-actions">
                    <button className="sync-action-btn primary" onClick={handleShareLink}>
                      <Share2 size={15} />
                      <span>Поделиться ссылкой</span>
                    </button>
                    <button className="sync-action-btn" onClick={copySyncLink}>
                      {copiedLink ? <Check size={15} /> : <LinkIcon size={15} />}
                      <span>{copiedLink ? 'Скопировано!' : 'Скопировать ссылку для ПК'}</span>
                    </button>
                    <button className="sync-action-btn" onClick={copySyncCode}>
                      {copiedCode ? <Check size={15} /> : <Copy size={15} />}
                      <span>{copiedCode ? 'Код скопирован!' : 'Скопировать код'}</span>
                    </button>
                  </div>
                  <span className="sync-subhint">
                    Отправьте ссылку себе в Telegram и откройте на ПК — прогресс применится в 1 клик!
                  </span>
                </div>

                {/* Paste on PC */}
                <div className="sync-card">
                  <div className="sync-card-head">
                    <Clipboard size={18} />
                    <div>
                      <b>2. Применить на компьютере</b>
                      <small>Вставьте ссылку или текстовый код</small>
                    </div>
                  </div>

                  <div className="sync-paste-box">
                    <textarea
                      rows={2}
                      placeholder="Вставьте ссылку (https://...#sync=...) или код Литеры…"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                    />
                    <div className="sync-card-actions">
                      <button className="sync-action-btn primary" onClick={pasteFromClipboard}>
                        <Clipboard size={15} />
                        <span>Вставить из буфера</span>
                      </button>
                      <button
                        className="sync-action-btn"
                        disabled={!manualCode.trim()}
                        onClick={() => handleRawData(manualCode)}
                      >
                        <Check size={15} />
                        <span>Применить</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {scanStatus.message && (
                <div className={`scan-status-alert status-${scanStatus.state}`}>
                  {scanStatus.message}
                </div>
              )}
            </div>
          )}

          {tab === 'qr' && (
            <div className="sync-tab-pane">
              <div className="sync-qr-split">
                <div className="sync-qr-col">
                  <b>Показать QR-код</b>
                  <div className="qr-wrapper">
                    <canvas ref={canvasRef} className="qr-canvas" />
                  </div>
                  <p className="sync-subhint">
                    Отсканируйте камерой телефона с экрана ПК или планшета.
                  </p>
                </div>

                <div className="sync-qr-col">
                  <b>Сканировать камерой</b>
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

                  <div className="sync-card-actions" style={{ marginTop: 10 }}>
                    {!cameraActive && (
                      <button className="sync-action-btn primary" onClick={startCamera}>
                        <RefreshCw size={15} />
                        <span>Включить камеру</span>
                      </button>
                    )}
                    <button
                      className="sync-action-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={15} />
                      <span>Фото QR</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={handleQrPhotoUpload}
                    />
                  </div>
                </div>
              </div>

              {scanStatus.message && (
                <div className={`scan-status-alert status-${scanStatus.state}`}>
                  {scanStatus.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
