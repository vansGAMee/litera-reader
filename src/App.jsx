import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, ChevronDown, Clock3, Focus, Heart, Highlighter, Library, Menu, Minus, Plus, QrCode, Search, Settings2, Sparkles, StickyNote, Upload, X } from 'lucide-react'
import { get, set } from 'idb-keyval'
import { formatReadingTime } from './lib/readingExtras.js'
import { usePageGestures } from './lib/usePageGestures.js'
import CoverEditor from './CoverEditor.jsx'
import QuoteTrainer from './QuoteTrainer.jsx'
import SyncModal from './SyncModal.jsx'
import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { seedBooks } from './data.js'
import { estimateMinutes, getInitials, normalizeText, pageFromProgress, paginate, resolveInitialPage, spreadProgress } from './lib/reader.js'
import { calculateEstimatedMinutes, countWords, getReadingProfile, recordReadingSample, resetReadingProfile, saveReadingProfile } from './lib/readingTracker.js'
import { importBook } from './lib/importBook.js'
import { migrateStoredBooks } from './lib/migrateLibrary.js'

const STORAGE_KEY = 'litera-library-v1'
const paletteNames = ['Терракотовая', 'Прусская', 'Оливковая']
const pdfDocuments = new WeakMap()

function Cover({ book, onClick, compact = false }) {
  const [main, accent, ink] = book.palette
  const surname = book.author.split(' ').at(-1)
  const givenName = book.author.slice(0, Math.max(0, book.author.lastIndexOf(surname))).trim()
  const surnameClass = surname.length > 12 ? 'cover-author--xl' : surname.length > 9 ? 'cover-author--long' : ''
  return <button type="button" className={`cover ${compact ? 'cover--compact' : ''}`} style={{ '--main': main, '--accent': accent, '--ink': ink }} onClick={onClick} aria-label={`Открыть ${book.title}`}>
    {book.coverImage ? <img className="custom-cover" src={book.coverImage} alt={book.title} style={{ objectFit: book.coverFit || 'cover', objectPosition: `${book.coverX ?? 50}% ${book.coverY ?? 50}%` }}/> : <>
    <div className="cover-art"><span className="orb orb-a"/><span className="orb orb-b"/><span className="engraving">{getInitials(book.author)}</span></div>
    <div className="cover-name"><b>{getInitials(book.author)}</b><span>{givenName || 'Автор'}</span></div>
    <div className={`cover-author ${surnameClass}`}>{surname}</div>
    <div className="cover-meta"><strong>{book.title}</strong><em>Книги, изменившие мир.<br/>Писатели, объединившие поколения.</em></div>
    <div className="cover-ribbon">Э К С К Л Ю З И В Н А Я · К Л А С С И К А</div></>}
  </button>
}

function App() {
  const [editing, setEditing] = useState(null)
  const [aiTrainerBook, setAiTrainerBook] = useState(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [importErrors, setImportErrors] = useState([])
  const importLock = useRef(false)
  const [books, setBooks] = useState(seedBooks)
  const [view, setView] = useState('library')
  const [activeId, setActiveId] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [storageWritable, setStorageWritable] = useState(false)
  const fileRef = useRef(null)
  const searchRef = useRef(null)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = NativeApp.addListener('backButton', () => {
      if (editing) setEditing(null)
      else if (syncOpen) setSyncOpen(false)
      else if (view === 'reader') setView('library')
      else NativeApp.minimizeApp()
    })
    return () => { listener.then(handle => handle.remove()) }
  }, [view, editing, syncOpen])

  useEffect(() => {
    get(STORAGE_KEY).then(async (saved) => {
      if (!Array.isArray(saved)) { setStorageWritable(true); return }
      const inspectPdf = async (file) => (await (await import('./lib/pdf.js')).openPdf(file)).numPages
      const { books: migrated, failures: migrationFailures } = await migrateStoredBooks(saved, importBook, undefined, inspectPdf)
      setBooks(migrated)
      setStorageWritable(true)
      if (migrationFailures) setToast(`Не удалось обновить PDF: ${migrationFailures}. Оригиналы сохранены`)
    }).catch(() => setToast('Не удалось прочитать локальную библиотеку')).finally(() => setHydrated(true))
  }, [])
  useEffect(() => { if (hydrated && storageWritable) set(STORAGE_KEY, books).catch(() => setToast('Не удалось сохранить изменения: проверьте место в браузере')) }, [books, hydrated, storageWritable])
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2600); return () => clearTimeout(id) }, [toast])
  useEffect(() => { const handler = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus() } }; addEventListener('keydown', handler); return () => removeEventListener('keydown', handler) }, [])

  const visible = useMemo(() => books.filter((book) => {
    const matches = `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase())
    return matches && (filter === 'all' || (filter === 'reading' && book.progress > 0 && book.progress < 100) || (filter === 'favorite' && book.favorite))
  }).sort((a, b) => sort === 'author' ? a.author.localeCompare(b.author, 'ru') : sort === 'title' ? a.title.localeCompare(b.title, 'ru') : b.progress - a.progress), [books, query, filter, sort])

  if (!hydrated) return <div className="loading-screen"><span className="brand-mark">Л</span><p>Расставляем книги на полке…</p></div>

  const openBook = (id) => { setActiveId(id); setView('reader'); window.scrollTo(0, 0) }
  const patchBook = (id, patch) => setBooks((all) => all.map((book) => book.id === id ? { ...book, ...patch } : book))
  const handleFiles = async (files) => {
    if (!storageWritable) { setImportErrors(['Хранилище недоступно. Освободите место и перезапустите приложение перед добавлением книг.']); return }
    if (importLock.current || !files?.length) return
    importLock.current = true
    setUploading(true)
    setImportErrors([])
    const imported = []; const errors = []
    for (const file of [...files]) {
      try { imported.push(await importBook(file)) }
      catch (error) { errors.push(`${file.name}: ${error.message}`) }
    }
    if (imported.length) setBooks((current) => [...imported, ...current])
    setImportErrors(errors)
    importLock.current = false
    setToast(errors.length ? `${imported.length} добавлено · ${errors[0]}` : `Добавлено книг: ${imported.length}`)
    setUploading(false)
  }

  if (view === 'reader') return <Reader book={books.find((book) => book.id === activeId) || books[0]} onBack={() => setView('library')} onChange={patchBook} />

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setView('library')}><span className="brand-mark">Л</span><span><b>Л И Т Е Р А</b><i>личное собрание</i></span></button>
      <nav><button className="active"><Library size={16}/>Библиотека</button><button onClick={() => visible[0] && openBook(visible[0].id)}><BookOpen size={16}/>Читать</button></nav>
      <div className="top-actions">
        <button aria-label="Синхронизация прогресса через QR-код" className="sync-button" onClick={() => setSyncOpen(true)} title="Синхронизация через QR-код"><QrCode size={16}/><span>Синхронизация</span></button>
        <button aria-label={uploading ? 'Обработка книг' : 'Добавить книгу'} disabled={uploading || !storageWritable} className="upload-button" onClick={() => fileRef.current?.click()}><Upload size={16}/><span>{uploading ? 'Обработка…' : 'Добавить книгу'}</span></button>
        <button className="icon-button mobile"><Menu/></button>
      </div>
      <input ref={fileRef} hidden multiple type="file" accept="*/*" onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
    </header>

    <main className="library-view" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}>
      {!!importErrors.length && <section className="import-errors" role="alert"><button aria-label="Закрыть ошибки" onClick={() => setImportErrors([])}>×</button><b>Не удалось добавить некоторые файлы</b><ul>{importErrors.map((error, i) => <li key={i}>{error}</li>)}</ul><p>Остальные книги добавлены. Можно выбрать другой файл и повторить.</p></section>}
      <section className="hero">
        <div className="eyebrow"><span/>ЛИЧНОЕ СОБРАНИЕ · {books.length} ТОМА</div>
        <h1>Ваша библиотека.<br/><em>Всегда рядом.</em></h1>
        <p>Книги остаются на вашем устройстве. Читайте без подписки, счётчиков и чужих рекомендаций.</p>
        <div className="hero-stats"><div><b>{books.filter(b => b.progress > 0).length}</b><span>начато</span></div><div><b>{books.filter(b => b.favorite).length}</b><span>любимых</span></div><div><b>{Math.round(books.reduce((n,b) => n + b.progress, 0) / books.length) || 0}%</b><span>прочитано</span></div></div>
      </section>

      <section className="shelf-head">
        <div><span className="section-number">01</span><h2>Книжная полка</h2></div>
      <div className="tools"><label className="search"><Search size={17}/><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Автор или название"/><kbd>⌘ K</kbd></label><label className="select">Сортировка:<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">по прогрессу</option><option value="author">по автору</option><option value="title">по названию</option></select><ChevronDown size={14}/></label></div>
      </section>
      <div className="filters">
        {[['all','Все издания'],['reading','Читаю сейчас'],['favorite','Избранное']].map(([key,label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}<sup>{key === 'all' ? books.length : key === 'reading' ? books.filter(b => b.progress > 0 && b.progress < 100).length : books.filter(b => b.favorite).length}</sup></button>)}
      </div>

      {visible.length ? <div className="book-grid">{visible.map((book, index) => <article className="book-card" key={book.id} style={{ '--delay': `${index * 45}ms` }}>
        <div className="book-stage"><Cover book={book} onClick={() => openBook(book.id)}/><button className={`favorite ${book.favorite ? 'on' : ''}`} onClick={() => patchBook(book.id, { favorite: !book.favorite })} aria-label="В избранное"><Heart size={16} fill={book.favorite ? 'currentColor' : 'none'}/></button></div>
        <div className="book-info"><div><h3>{book.title}</h3><p>{book.author}</p></div><button aria-label={`Удалить ${book.title}`} title="Удалить из библиотеки" onClick={() => { if (confirm(`Удалить «${book.title}» из библиотеки?`)) setBooks(all => all.filter(item => item.id !== book.id)) }}><X size={18}/></button></div>
        <div className="card-actions-row">
          <button className="edit-cover" onClick={() => setEditing(book.id)} aria-label={`Изменить обложку ${book.title}`}><Settings2 size={14}/> Обложка</button>
          <button className="ai-quote-card-btn" onClick={() => setAiTrainerBook(book)} aria-label={`Цитаты: ${book.title}`} title="Подобрать цитаты из книги"><Sparkles size={14}/> Цитаты</button>
        </div>
        <div className="progress-row"><span><i style={{ width: `${book.progress}%` }}/></span><small>{book.progress ? `${book.progress}%` : 'Не начато'}</small></div>
      </article>)}</div> : <div className="empty"><span>∅</span><h3>На этой полке пока пусто</h3><p>Измените фильтр или добавьте свою книгу.</p></div>}

      <button disabled={uploading || !storageWritable} className="dropzone" onClick={() => fileRef.current?.click()}><Upload/><span><b>Пополнить собрание</b><small>EPUB · MOBI · AZW3 · FB2 · PDF · DOCX · RTF · TXT · MD · HTML · CBZ · изображения</small></span><strong>Выбрать файл</strong></button>
    </main>
    <footer><span>ЛИТЕРА / ЦИФРОВОЕ СОБРАНИЕ</span><i>Частное чтение. Без подписки.</i><span>Все данные хранятся локально</span></footer>
    {editing && <CoverEditor key={editing} book={books.find(book => book.id === editing)} Preview={Cover} onSave={async patch => {
      if (!storageWritable) throw new Error('Хранилище недоступно')
      await set(STORAGE_KEY, books.map(book => book.id === editing ? { ...book, ...patch } : book))
      patchBook(editing, patch)
    }} onClose={() => setEditing(null)}/>}
    {aiTrainerBook && <QuoteTrainer book={aiTrainerBook} onClose={() => setAiTrainerBook(null)} onSaveQuote={(quoteData) => {
      patchBook(aiTrainerBook.id, { notes: [{ id: Date.now(), ...quoteData }, ...(aiTrainerBook.notes || [])] })
      setToast('Цитата сохранена в заметки')
    }} onJumpToPage={(p) => {
      setActiveId(aiTrainerBook.id)
      setView('reader')
    }} />}
    {syncOpen && <SyncModal books={books} onSyncApply={(updated, msg) => {
      setBooks(updated)
      setToast(msg)
      setSyncOpen(false)
    }} onClose={() => setSyncOpen(false)} />}
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>
}

function Reader({ book, onBack, onChange }) {
  const [fontSize, setFontSize] = useState(+localStorage.getItem('litera-font') || 19)
  const [theme, setTheme] = useState(localStorage.getItem('litera-theme') || 'paper')
  const [pageSeconds, setPageSeconds] = useState(() => Math.max(30, Math.min(180, +localStorage.getItem('litera-page-seconds') || 60)))
  const [turn, setTurn] = useState(1)
  const [panel, setPanel] = useState(null)
  const [focus, setFocus] = useState(false)
  const [notes, setNotes] = useState(book.notes || [])
  const [trainerOpen, setTrainerOpen] = useState(false)
  const [selected, setSelected] = useState('')
  const pageSize = fontSize >= 22 ? 1150 : fontSize <= 17 ? 2000 : 1550
  const isVisual = book.kind === 'visual'
  const visualCount = book.sourceFormat === 'PDF' ? book.pageCount : book.pages?.length
  const pages = useMemo(() => isVisual ? Array.from({ length: visualCount || 1 }, () => '') : paginate(normalizeText(book.text || ''), pageSize), [book.text, pageSize, isVisual, visualCount])

  // Exact page resolution without +2 off-by-two bug:
  const isMobileView = () => typeof window !== 'undefined' && (window.innerWidth <= 760 || (window.matchMedia && window.matchMedia('(max-width: 760px)').matches))
  const [mobile, setMobile] = useState(isMobileView)
  const [page, setPage] = useState(() => resolveInitialPage(book, pages.length))
  const locationRef = useRef(resolveInitialPage(book, pages.length))
  const skipInitialPersist = useRef(true)
  const panelRef = useRef(null)
  const panelOpener = useRef(null)

  // Smart reading speed profile with AFK detection
  const [profile, setProfile] = useState(getReadingProfile)
  const activeSecondsRef = useRef(0)
  const lastActiveTimeRef = useRef(performance.now())
  const isIdleRef = useRef(false)
  const current = Math.min(page, Math.max(0, pages.length - 1))
  const previousPageRef = useRef(current)

  const pct = spreadProgress(current, pages.length, mobile)
  const remainingWords = useMemo(() => isVisual ? 0 : countWords(pages.slice(current).join(' ')), [isVisual, pages, current])
  const remaining = useMemo(() => isVisual ? Math.ceil((pages.length - current) * pageSeconds / 60) : calculateEstimatedMinutes(remainingWords, profile.wpm), [isVisual, pages, current, pageSeconds, remainingWords, profile.wpm])

  useEffect(() => { localStorage.setItem('litera-page-seconds', pageSeconds) }, [pageSeconds])
  useEffect(() => { localStorage.setItem('litera-font', fontSize); localStorage.setItem('litera-theme', theme) }, [fontSize, theme])

  useEffect(() => {
    const update = () => setMobile(isMobileView())
    window.addEventListener('resize', update)
    const media = matchMedia('(max-width: 760px)')
    media.addEventListener('change', update)
    return () => {
      window.removeEventListener('resize', update)
      media.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    setPage(resolveInitialPage(book, pages.length))
  }, [pages.length])

  // Persist current page index and progress safely
  useEffect(() => {
    if (skipInitialPersist.current) { skipInitialPersist.current = false; return }
    onChange(book.id, { progress: pct, currentPage: current, notes })
  }, [current, notes])

  // AFK detection & reading interval tracker
  useEffect(() => {
    if (previousPageRef.current !== current) {
      const prevPage = previousPageRef.current
      previousPageRef.current = current
      const wordsOnPage = isVisual ? 0 : countWords(pages[prevPage] || '')
      const elapsed = activeSecondsRef.current
      activeSecondsRef.current = 0
      lastActiveTimeRef.current = performance.now()
      isIdleRef.current = false

      if (!isVisual && wordsOnPage >= 10 && elapsed >= 3) {
        const result = recordReadingSample(wordsOnPage, elapsed, profile)
        if (result.updated) setProfile(result.profile)
      }
    }
  }, [current, isVisual, pages, profile])

  useEffect(() => {
    const markActive = () => {
      lastActiveTimeRef.current = performance.now()
      isIdleRef.current = false
    }
    const events = ['pointerdown', 'touchstart', 'scroll', 'keydown']
    events.forEach(evt => window.addEventListener(evt, markActive, { passive: true }))

    const timer = setInterval(() => {
      if (document.hidden) return
      const now = performance.now()
      if (now - lastActiveTimeRef.current > 60000) {
        isIdleRef.current = true
      } else {
        activeSecondsRef.current += 1
      }
    }, 1000)

    return () => {
      events.forEach(evt => window.removeEventListener(evt, markActive))
      clearInterval(timer)
    }
  }, [])

  const handleBack = () => {
    onChange(book.id, { progress: pct, currentPage: current, notes })
    onBack()
  }

  useEffect(() => {
    if (!panel) return
    const dialog = panelRef.current; const focusable = () => [...dialog.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    const trap = (e) => { if (e.key !== 'Tab') return; const items = focusable(); if (!items.length) return; const first = items[0]; const last = items.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() } }
    dialog.addEventListener('keydown', trap); return () => dialog.removeEventListener('keydown', trap)
  }, [panel])

  const closePanel = () => { setPanel(null); setTimeout(() => panelOpener.current?.focus(), 0) }
  const openPanel = (name, event) => { panelOpener.current = event.currentTarget; setPanel(panel === name ? null : name) }
  const jumpPage = (target) => {
    const next = Math.max(0, Math.min(target, pages.length - 1))
    setTurn(next >= current ? 1 : -1)
    locationRef.current = next
    setPage(next)
  }
  const movePage = delta => jumpPage(current + delta)
  const gestures = usePageGestures(direction => movePage(direction * (mobile ? 1 : 2)), !!panel)

  useEffect(() => {
    const keys = (e) => {
      if (e.key === 'Escape' && panel) { closePanel(); return }
      if (['INPUT','TEXTAREA','BUTTON','A','SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return
      const step = mobile ? 1 : 2
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); movePage(step) }
      if (e.key === 'ArrowLeft') movePage(-step)
      if (e.key.toLowerCase() === 'f') setFocus(v => !v)
    }
    addEventListener('keydown', keys); return () => removeEventListener('keydown', keys)
  }, [current, pages.length, mobile, panel])

  useEffect(() => { document.querySelector('.reading-desk')?.scrollTo({ top: 0 }); document.querySelectorAll('.paper').forEach((paper) => paper.scrollTo({ top: 0 })) }, [current])

  const captureSelection = () => {
    const text = window.getSelection()?.toString().trim()
    if (text) setSelected(text)
  }
  const addNote = () => {
    if (!selected) return
    const note = prompt('Заметка к цитате (можно оставить пустой):') ?? ''
    setNotes((all) => [{ id: Date.now(), quote: selected, note, page: current + 1 }, ...all])
    setSelected('')
    window.getSelection()?.removeAllRanges()
  }

  return <div className={`reader theme-${theme} ${focus ? 'is-focus' : ''}`} style={{ '--reading-size': `${fontSize}px`, '--turn-offset': `${turn * 16}px` }}>
    <header className="reader-top">
      <button className="reader-brand" onClick={handleBack}><span>Л</span><i>ЛИТЕРА</i></button>
      <button className="back" onClick={handleBack}><ArrowLeft size={17}/> Библиотека</button>
      <div className="reader-title"><b>{book.title}</b><span>{book.author}</span></div>
      <div className="reader-actions">
        <button aria-label="Режим фокуса" aria-pressed={focus} onClick={() => setFocus(!focus)} title="Режим фокуса (F)"><Focus size={18}/></button>
        {selected ? (
          <button aria-label="Сохранить выделенную цитату" onClick={addNote} title="Сохранить цитату" className="ai-quote-trigger quote-active-btn">
            <Highlighter size={18}/><span>Сохранить</span>
          </button>
        ) : (
          <button aria-label="Цитаты" onClick={() => setTrainerOpen(true)} title="Избранные цитаты" className="ai-quote-trigger"><Sparkles size={18}/><span>Цитаты</span></button>
        )}
        <button aria-label="Заметки и цитаты" aria-expanded={panel === 'notes'} onClick={(e) => openPanel('notes', e)}><StickyNote size={18}/></button>
        <button aria-label="Настройки чтения" aria-expanded={panel === 'settings'} onClick={(e) => openPanel('settings', e)}><Settings2 size={18}/></button>
      </div>
    </header>

    <div className="reader-status">
      <span><b>{String(current + 1).padStart(3,'0')}</b> / {String(pages.length).padStart(3,'0')}</span>
      <div><i style={{ width: `${pct}%` }}/></div>
      <span><Clock3 size={14}/> <span aria-label="Осталось читать">≈ {formatReadingTime(remaining)} до конца ({profile.wpm} сл/мин)</span></span>
    </div>

    {/* Floating safe-zone quote bar for mobile (placed at top to never overlap with Google Translate) */}
    {!isVisual && selected && (
      <aside className="selection-floating-bar" aria-label="Сохранение цитаты">
        <div className="selection-pill">
          <div className="selection-snippet">
            <Highlighter size={14}/>
            <span>«{selected.slice(0, 32)}{selected.length > 32 ? '…' : ''}»</span>
          </div>
          <div className="selection-actions-group">
            <button className="save-quote-action" onMouseDown={(e) => e.preventDefault()} onClick={addNote}>
              <Check size={14}/> Сохранить цитату
            </button>
            <button className="cancel-quote-action" onMouseDown={(e) => e.preventDefault()} onClick={() => { setSelected(''); window.getSelection()?.removeAllRanges(); }} aria-label="Снять выделение">
              <X size={14}/>
            </button>
          </div>
        </div>
      </aside>
    )}

    <main className="reading-desk" {...gestures}>
      {isVisual ? <VisualSpread key={current} book={book} current={current} /> : <div key={current} className="spread" onMouseUp={captureSelection} onTouchEnd={() => setTimeout(captureSelection, 100)}>
        <div className="paper page-left"><div className="running"><span>{book.author}</span><em>ЛИТЕРА · ЛИЧНОЕ СОБРАНИЕ</em></div><PageText text={pages[current]} first={current === 0}/><div className="folio"><span>{current + 1}</span><i>{book.title}</i></div></div>
        <div className="paper page-right"><div className="bookmark-ribbon"/><div className="running"><em>ЭКСКЛЮЗИВНАЯ КЛАССИКА</em><span>{book.title}</span></div><PageText text={pages[current + 1] || ''}/><div className="folio"><i>{book.author}</i><span>{Math.min(current + 2, pages.length)}</span></div></div>
      </div>}
    </main>

    <nav className="reader-navigation" aria-label="Перелистывание">
      <button aria-label="Предыдущая страница" disabled={current === 0} onClick={() => movePage(-(mobile ? 1 : 2))}><ArrowLeft/></button>
      <label className="page-slider"><span>{current + 1} / {pages.length} стр. · {pct}%<small>Свайп или тап по краям</small></span><input aria-label="Перейти к странице" type="range" min="1" max={pages.length} value={current + 1} onChange={e => jumpPage(+e.target.value - 1)}/></label>
      <button aria-label="Следующая страница" disabled={current >= pages.length - (mobile ? 1 : 2)} onClick={() => movePage(mobile ? 1 : 2)}><ArrowRight/></button>
    </nav>
    <footer className="reader-bottom"><span>Режим чтения</span><span>Шрифт: EB Garamond · {fontSize}px</span><button onClick={(e) => openPanel('notes', e)}><Bookmark size={15}/> Заметки и цитаты · {notes.length}</button><span className="shortcuts">← → листать · F фокус</span></footer>

    {panel && <div className="panel-backdrop" onClick={closePanel}><aside ref={panelRef} className="side-panel" role="dialog" aria-modal="true" aria-label={panel === 'settings' ? 'Настройки чтения' : 'Заметки и цитаты'} onClick={(e) => e.stopPropagation()}><div className="panel-head"><div><small>{panel === 'settings' ? 'ВИД ИЗДАНИЯ' : 'ПОЛЯ ЧИТАТЕЛЯ'}</small><h2>{panel === 'settings' ? 'Настройки чтения' : 'Заметки и цитаты'}</h2></div><button aria-label="Закрыть" autoFocus onClick={closePanel}><X/></button></div>
      {panel === 'settings' ? <div className="settings-list">
        <section className="reading-estimate">
          <b>≈ {formatReadingTime(remaining)} до конца</b>
          <p>{isVisual ? 'Приблизительно: по времени на одну страницу, включая текущую.' : 'Умный расчёт по вашей персональной скорости (паузы и AFK исключаются).'}</p>
          <div className="personal-speed-badge">
            <div className="speed-stat-main">
              <span className="speed-stat-num">{profile.wpm}</span>
              <span className="speed-stat-lbl">слов / мин (WPM)</span>
            </div>
            <p className="speed-stat-desc">
              {profile.sampleCount > 0
                ? `Откалибровано по ${profile.sampleCount} страницам (${profile.totalWords} слов)`
                : 'Адаптивный алгоритм: скорость подстраивается автоматически при чтении.'}
            </p>
            {profile.sampleCount > 0 && (
              <button
                className="reset-speed-link"
                onClick={() => setProfile(resetReadingProfile())}
                title="Сбросить историю и начать калибровку заново"
              >
                Сбросить калибровку
              </button>
            )}
          </div>
          <label>{isVisual ? 'Секунд на страницу' : 'Ручная подстройка скорости'}<b>{isVisual ? pageSeconds : profile.wpm}</b></label>
          <input
            aria-label={isVisual ? 'Секунд на страницу' : 'Скорость чтения'}
            type="range"
            min={isVisual ? 30 : 100}
            max={isVisual ? 180 : 450}
            step={isVisual ? 15 : 5}
            value={isVisual ? pageSeconds : profile.wpm}
            onChange={e => {
              if (isVisual) {
                setPageSeconds(+e.target.value)
              } else {
                const custom = { ...profile, wpm: +e.target.value, isCustom: true }
                setProfile(custom)
                saveReadingProfile(custom)
              }
            }}
          />
        </section>
        <section><label>Кегль текста <b>{fontSize}px</b></label><div className="stepper"><button onClick={() => setFontSize(Math.max(15,fontSize-1))}><Minus/></button><span>Аа</span><button onClick={() => setFontSize(Math.min(25,fontSize+1))}><Plus/></button></div></section>
        <section><label>Оттенок бумаги</label><div className="themes">{[['paper','Слоновая кость'],['white','Белый лист'],['sepia','Сепия'],['night','Ночной']].map(([key,label]) => <button key={key} onClick={() => setTheme(key)} className={`${key} ${theme === key ? 'active' : ''}`}><i/>{label}</button>)}</div></section>
        <section className="quiet"><Focus/><div><b>Тихий режим</b><p>Нажмите F — всё лишнее исчезнет, останется только книга.</p></div></section>
      </div> : <div className="notes-list">{notes.length ? notes.map((item) => <article key={item.id}><small>СТРАНИЦА {item.page}</small><blockquote>«{item.quote}»</blockquote>{item.note && <p>{item.note}</p>}<button onClick={() => setNotes(n => n.filter(x => x.id !== item.id))}>Удалить</button></article>) : <div className="no-notes"><Highlighter/><h3>Здесь пока тихо</h3><p>Выделите фрагмент текста и сохраните его как цитату или заметку.</p></div>}</div>}
    </aside></div>}
    {trainerOpen && <QuoteTrainer book={book} onClose={() => setTrainerOpen(false)} onSaveQuote={(quoteData) => {
      setNotes((all) => [{ id: Date.now(), ...quoteData }, ...all])
    }} onJumpToPage={(p) => jumpPage(p)} />}
  </div>
}

function PageText({ text, first }) {
  const blocks = text.split(/\n{2,}/).filter(Boolean)
  const heading = first && blocks[0]?.length <= 80 ? blocks.shift() : null
  return <div className="page-content">{first && <div className="chapter"><small>КНИГА ПЕРВАЯ</small><h1>{heading || 'Начало'}</h1><span/></div>}{blocks.map((p,i) => <p key={i}>{p}</p>)}</div>
}

function VisualSpread({ book, current }) {
  const isPdf = book.sourceFormat === 'PDF'
  const page = (index) => isPdf
    ? <PdfCanvas file={book.pages[0]} number={index + 1}/>
    : <ImagePage file={book.pages[index]}/>
  return <div className="spread visual-spread">
    <div className="paper page-left visual-paper"><div className="running"><span>{book.author}</span><em>{book.sourceFormat} · ЛИТЕРА</em></div>{page(current)}<div className="folio"><span>{current + 1}</span><i>{book.title}</i></div></div>
    <div className="paper page-right visual-paper"><div className="bookmark-ribbon"/><div className="running"><em>ЭКСКЛЮЗИВНАЯ КЛАССИКА</em><span>{book.title}</span></div>{current + 1 < (isPdf ? book.pageCount : book.pages.length) ? page(current + 1) : <div className="end-mark">КОНЕЦ</div>}<div className="folio"><i>{book.author}</i><span>{Math.min(current + 2, isPdf ? book.pageCount : book.pages.length)}</span></div></div>
  </div>
}

function ImagePage({ file }) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : '', [file])
  useEffect(() => () => url && URL.revokeObjectURL(url), [url])
  return <div className="visual-content">{url && <img src={url} alt="Страница книги"/>}</div>
}

function PdfCanvas({ file, number }) {
  const wrapRef = useRef(null); const canvasRef = useRef(null)
  const [error, setError] = useState('')
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!wrapRef.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(wrapRef.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!width) return
    let cancelled = false; let task
    setError('')
    const render = async () => {
      try {
        if (!pdfDocuments.has(file)) pdfDocuments.set(file, import('./lib/pdf.js').then(({ openPdf }) => openPdf(file)).catch(error => { pdfDocuments.delete(file); throw error }))
        const pdf = await pdfDocuments.get(file)
        if (cancelled) return
        const pdfPage = await pdf.getPage(number)
        if (cancelled || !canvasRef.current) return
        const base = pdfPage.getViewport({ scale: 1 }); const available = Math.max(260, width || wrapRef.current.clientWidth)
        const scale = available / base.width; const viewport = pdfPage.getViewport({ scale })
        const ratio = Math.min(devicePixelRatio || 1, 2); const canvas = canvasRef.current; const context = canvas.getContext('2d')
        canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio)
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`
        task = pdfPage.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio,0,0,ratio,0,0] })
        await task.promise
      } catch (reason) { if (!cancelled && reason?.name !== 'RenderingCancelledException') setError(`Не удалось отрисовать страницу: ${reason.message || 'неизвестная ошибка'}`) }
    }
    render(); return () => { cancelled = true; task?.cancel() }
  }, [file, number, width])
  return <div ref={wrapRef} className="visual-content pdf-canvas">{error && <p role="alert">{error}</p>}<canvas ref={canvasRef} hidden={!!error}/></div>
}

export default App
