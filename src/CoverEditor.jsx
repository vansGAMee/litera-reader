import { useEffect, useRef, useState } from 'react'

async function readCover(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Выберите изображение меньше 20 МБ')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.88)
  } finally { URL.revokeObjectURL(url) }
}

export default function CoverEditor({ book, Preview, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...book })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dialog = useRef(null)
  useEffect(() => { dialog.current.showModal() }, [])
  const patch = values => setDraft(current => ({ ...current, ...values }))
  return <dialog ref={dialog} className="cover-editor" onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose() }} aria-labelledby="cover-editor-title">
    <form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await onSave({ title: draft.title.trim() || book.title, author: draft.author.trim() || 'Неизвестный автор', palette: draft.palette, coverImage: draft.coverImage || null, coverFit: draft.coverFit || 'cover', coverX: draft.coverX ?? 50, coverY: draft.coverY ?? 50 }); onClose() } catch { setError('Не удалось сохранить обложку. Освободите место и попробуйте ещё раз.') } finally { setBusy(false) } }}>
      <div className="editor-heading"><h2 id="cover-editor-title">Оформление книги</h2><button type="button" aria-label="Закрыть редактор" onClick={onClose}>×</button></div>
      <div className="editor-body"><div className="editor-preview"><Preview book={draft}/></div><div className="editor-fields">
        <label>Название<input autoFocus required maxLength={200} value={draft.title} onChange={e => patch({ title: e.target.value })}/></label>
        <label>Автор<input maxLength={160} value={draft.author} onChange={e => patch({ author: e.target.value })}/></label>
        <label className="cover-upload">Загрузить обложку<input type="file" accept="image/*" disabled={busy} onChange={async e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
          setBusy(true); setError('')
          try { patch({ coverImage: await readCover(file), coverX: 50, coverY: 50 }) }
          catch (err) { setError(err.message.includes('20 МБ') ? err.message : 'Не удалось открыть изображение. Попробуйте JPG, PNG или WebP.') }
          finally { setBusy(false) }
        }}/></label>
        {draft.coverImage ? <>
          <label>Расположение<select value={draft.coverFit || 'cover'} onChange={e => patch({ coverFit: e.target.value })}><option value="cover">Заполнить обложку</option><option value="contain">Показать целиком</option></select></label>
          <label>По горизонтали<input type="range" min="0" max="100" value={draft.coverX ?? 50} onChange={e => patch({ coverX: +e.target.value })}/></label>
          <label>По вертикали<input type="range" min="0" max="100" value={draft.coverY ?? 50} onChange={e => patch({ coverY: +e.target.value })}/></label>
          <button type="button" onClick={() => patch({ coverImage: null })}>Вернуть текстовую обложку</button>
        </> : <div className="editor-colors">{['Основной цвет', 'Акцент', 'Цвет текста'].map((label, i) => <label key={label}>{label}<input type="color" value={draft.palette[i]} onChange={e => patch({ palette: draft.palette.map((color, n) => n === i ? e.target.value : color) })}/></label>)}</div>}
        {error && <p role="alert">{error}</p>}
      </div></div>
      <div className="editor-actions"><button type="button" onClick={onClose}>Отмена</button><button type="submit" disabled={busy}>{busy ? 'Обработка…' : 'Сохранить'}</button></div>
    </form>
  </dialog>
}
