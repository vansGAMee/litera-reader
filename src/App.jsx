import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, ChevronDown, Clock3, Focus, Heart, Highlighter, Library, Menu, Minus, Plus, Search, Settings2, StickyNote, Upload, X } from 'lucide-react'
import { get, set } from 'idb-keyval'
import { seedBooks } from './data.js'
import { estimateMinutes, getInitials, normalizeText, pageFromProgress, paginate, spreadProgress } from './lib/reader.js'
import { importBook } from './lib/importBook.js'
import { migrateStoredBooks } from './lib/migrateLibrary.js'

const STORAGE_KEY = 'litera-library-v1'
const paletteNames = ['Терракотовая', 'Прусская', 'Оливковая']
const pdfDocuments = new WeakMap()

function Cover({ book, onClick, compact = false }) {
  const [main, accent, ink] = book.palette
  const surname = book.author.split(' ').at(-1)
  return <button className={`cover ${compact ? 'cover--compact' : ''}`} style={{ '--main': main, '--accent': accent, '--ink': ink }} onClick={onClick} aria-label={`Открыть ${book.title}`}>
    <div className="cover-art"><span className="orb orb-a"/><span className="orb orb-b"/><span className="engraving">{getInitials(book.author)}</span></div>
    <div className="cover-name"><b>{getInitials(book.author)}</b><span>{book.author.replace(surname, '')}</span></div>
    <div className="cover-author">{surname}</div>
    <div className="cover-meta"><strong>{book.title}</strong><em>Книги, изменившие мир.<br/>Писатели, объединившие поколения.</em></div>
    <div className="cover-ribbon">Э К С К Л Ю З И В Н А Я · К Л А С С И К А</div>
  </button>
}

function App() {
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
    setUploading(true)
    const imported = []; const errors = []
    for (const file of [...files]) {
      try { imported.push(await importBook(file)) }
      catch (error) { errors.push(`${file.name}: ${error.message}`) }
    }
    if (imported.length) setBooks((current) => [...imported, ...current])
    setToast(errors.length ? `${imported.length} добавлено · ${errors[0]}` : `Добавлено книг: ${imported.length}`)
    setUploading(false)
  }

  if (view === 'reader') return <Reader book={books.find((book) => book.id === activeId) || books[0]} onBack={() => setView('library')} onChange={patchBook} />

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setView('library')}><span className="brand-mark">Л</span><span><b>Л И Т Е Р А</b><i>личное собрание</i></span></button>
      <nav><button className="active"><Library size={16}/>Библиотека</button><button onClick={() => visible[0] && openBook(visible[0].id)}><BookOpen size={16}/>Читать</button></nav>
      <div className="top-actions"><button className="upload-button" onClick={() => fileRef.current?.click()}><Upload size={16}/><span>{uploading ? 'Обработка…' : 'Добавить книгу'}</span></button><button className="icon-button mobile"><Menu/></button></div>
      <input ref={fileRef} hidden multiple type="file" accept=".epub,.mobi,.azw,.azw3,.fb2,.fb2.zip,.fbz,.cbz,.pdf,.docx,.rtf,.txt,.md,.markdown,.html,.htm,.jpg,.jpeg,.png,.webp,.gif,.avif" onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
    </header>

    <main className="library-view" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}>
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
        <div className="progress-row"><span><i style={{ width: `${book.progress}%` }}/></span><small>{book.progress ? `${book.progress}%` : 'Не начато'}</small></div>
      </article>)}</div> : <div className="empty"><span>∅</span><h3>На этой полке пока пусто</h3><p>Измените фильтр или добавьте свою книгу.</p></div>}

      <button className="dropzone" onClick={() => fileRef.current?.click()}><Upload/><span><b>Пополнить собрание</b><small>EPUB · MOBI · AZW3 · FB2 · PDF · DOCX · RTF · TXT · MD · HTML · CBZ · изображения</small></span><strong>Выбрать файл</strong></button>
    </main>
    <footer><span>ЛИТЕРА / ЦИФРОВОЕ СОБРАНИЕ</span><i>Частное чтение. Без подписки.</i><span>Все данные хранятся локально</span></footer>
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>
}

function Reader({ book, onBack, onChange }) {
  const [fontSize, setFontSize] = useState(+localStorage.getItem('litera-font') || 19)
  const [theme, setTheme] = useState(localStorage.getItem('litera-theme') || 'paper')
  const [panel, setPanel] = useState(null)
  const [focus, setFocus] = useState(false)
  const [notes, setNotes] = useState(book.notes || [])
  const [selected, setSelected] = useState('')
  const locationRef = useRef(book.progress || 0)
  const skipInitialPersist = useRef(true)
  const panelRef = useRef(null)
  const panelOpener = useRef(null)
  const pageSize = fontSize >= 22 ? 1150 : fontSize <= 17 ? 2000 : 1550
  const isVisual = book.kind === 'visual'
  const visualCount = book.sourceFormat === 'PDF' ? book.pageCount : book.pages?.length
  const pages = useMemo(() => isVisual ? Array.from({ length: visualCount || 1 }, () => '') : paginate(normalizeText(book.text || ''), pageSize), [book.text, pageSize, isVisual, visualCount])
  const [page, setPage] = useState(() => pageFromProgress(book.progress || 0, pages.length))
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 760px)').matches)
  const current = Math.min(page, Math.max(0, pages.length - 1))
  const pct = spreadProgress(current, pages.length, mobile)
  const visibleEnd = Math.min(current + (mobile ? 1 : 2), pages.length)
  const remaining = isVisual ? Math.max(0, pages.length - visibleEnd) : estimateMinutes(pages.slice(visibleEnd).join(' '))

  useEffect(() => { localStorage.setItem('litera-font', fontSize); localStorage.setItem('litera-theme', theme) }, [fontSize, theme])
  useEffect(() => { const media = matchMedia('(max-width: 760px)'); const update = () => setMobile(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update) }, [])
  useEffect(() => { setPage(pageFromProgress(locationRef.current, pages.length)) }, [pages.length])
  useEffect(() => { if (skipInitialPersist.current) { skipInitialPersist.current = false; return } onChange(book.id, { progress: pct, notes }) }, [current, notes])
  useEffect(() => {
    if (!panel) return
    const dialog = panelRef.current; const focusable = () => [...dialog.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    const trap = (e) => { if (e.key !== 'Tab') return; const items = focusable(); if (!items.length) return; const first = items[0]; const last = items.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() } }
    dialog.addEventListener('keydown', trap); return () => dialog.removeEventListener('keydown', trap)
  }, [panel])
  const closePanel = () => { setPanel(null); setTimeout(() => panelOpener.current?.focus(), 0) }
  const openPanel = (name, event) => { panelOpener.current = event.currentTarget; setPanel(panel === name ? null : name) }
  const movePage = (delta) => setPage((value) => { const next = Math.max(0, Math.min(value + delta, pages.length - 1)); locationRef.current = spreadProgress(next, pages.length, mobile); return next })
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
  }, [pages.length, mobile, panel])
  useEffect(() => { document.querySelectorAll('.paper').forEach((paper) => paper.scrollTo({ top: 0 })) }, [current])

  const captureSelection = () => { const text = window.getSelection()?.toString().trim(); if (text) setSelected(text) }
  const addNote = () => { if (!selected) return; const note = prompt('Заметка к цитате (можно оставить пустой):') ?? ''; setNotes((all) => [{ id: Date.now(), quote: selected, note, page: current + 1 }, ...all]); setSelected(''); window.getSelection()?.removeAllRanges() }

  return <div className={`reader theme-${theme} ${focus ? 'is-focus' : ''}`} style={{ '--reading-size': `${fontSize}px` }}>
    <header className="reader-top">
      <button className="reader-brand" onClick={onBack}><span>Л</span><i>ЛИТЕРА</i></button>
      <button className="back" onClick={onBack}><ArrowLeft size={17}/> Библиотека</button>
      <div className="reader-title"><b>{book.title}</b><span>{book.author}</span></div>
      <div className="reader-actions"><button aria-label="Режим фокуса" aria-pressed={focus} onClick={() => setFocus(!focus)} title="Режим фокуса (F)"><Focus size={18}/></button><button aria-label="Заметки и цитаты" aria-expanded={panel === 'notes'} onClick={(e) => openPanel('notes', e)}><StickyNote size={18}/><span>{notes.length}</span></button><button aria-label="Настройки чтения" aria-expanded={panel === 'settings'} onClick={(e) => openPanel('settings', e)}><Settings2 size={18}/></button></div>
    </header>
    <div className="reader-status"><span><b>{String(current + 1).padStart(3,'0')}</b> / {String(pages.length).padStart(3,'0')}</span><div><i style={{ width: `${pct}%` }}/></div><span><Clock3 size={14}/> {remaining ? isVisual ? `${remaining} стр. до конца` : `≈ ${remaining} мин до конца` : 'последняя страница'}</span></div>

    <main className="reading-desk">
      {isVisual ? <VisualSpread book={book} current={current} /> : <div className="spread" onMouseUp={captureSelection}>
        <div className="paper page-left"><div className="running"><span>{book.author}</span><em>ЛИТЕРА · ЛИЧНОЕ СОБРАНИЕ</em></div><PageText text={pages[current]} first={current === 0}/><div className="folio"><span>{current + 1}</span><i>{book.title}</i></div></div>
        <div className="paper page-right"><div className="bookmark-ribbon"/><div className="running"><em>ЭКСКЛЮЗИВНАЯ КЛАССИКА</em><span>{book.title}</span></div><PageText text={pages[current + 1] || ''}/><div className="folio"><i>{book.author}</i><span>{Math.min(current + 2, pages.length)}</span></div></div>
      </div>}
      <><button aria-label="Предыдущая страница" className="page-nav prev" disabled={current === 0} onClick={() => movePage(-(mobile ? 1 : 2))}><ArrowLeft/></button><button aria-label="Следующая страница" className="page-nav next" disabled={current >= pages.length - (mobile ? 1 : 2)} onClick={() => movePage(mobile ? 1 : 2)}><ArrowRight/></button></>
      {!isVisual && selected && <button className="selection-action" onMouseDown={(e) => e.preventDefault()} onClick={addNote}><Highlighter size={15}/> Сохранить цитату</button>}
    </main>
    <footer className="reader-bottom"><span><i className="live"/> Режим чтения</span><span>Шрифт: EB Garamond · {fontSize}px</span><button onClick={(e) => openPanel('notes', e)}><Bookmark size={15}/> Заметки и цитаты · {notes.length}</button><span className="shortcuts">← → листать · F фокус</span></footer>

    {panel && <div className="panel-backdrop" onClick={closePanel}><aside ref={panelRef} className="side-panel" role="dialog" aria-modal="true" aria-label={panel === 'settings' ? 'Настройки чтения' : 'Заметки и цитаты'} onClick={(e) => e.stopPropagation()}><div className="panel-head"><div><small>{panel === 'settings' ? 'ВИД ИЗДАНИЯ' : 'ПОЛЯ ЧИТАТЕЛЯ'}</small><h2>{panel === 'settings' ? 'Настройки чтения' : 'Заметки и цитаты'}</h2></div><button aria-label="Закрыть" autoFocus onClick={closePanel}><X/></button></div>
      {panel === 'settings' ? <div className="settings-list"><section><label>Кегль текста <b>{fontSize}px</b></label><div className="stepper"><button onClick={() => setFontSize(Math.max(15,fontSize-1))}><Minus/></button><span>Аа</span><button onClick={() => setFontSize(Math.min(25,fontSize+1))}><Plus/></button></div></section><section><label>Оттенок бумаги</label><div className="themes">{[['paper','Слоновая кость'],['white','Белый лист'],['sepia','Сепия'],['night','Ночной']].map(([key,label]) => <button key={key} onClick={() => setTheme(key)} className={`${key} ${theme === key ? 'active' : ''}`}><i/>{label}</button>)}</div></section><section className="quiet"><Focus/><div><b>Тихий режим</b><p>Нажмите F — всё лишнее исчезнет, останется только книга.</p></div></section></div> : <div className="notes-list">{notes.length ? notes.map((item) => <article key={item.id}><small>СТРАНИЦА {item.page}</small><blockquote>«{item.quote}»</blockquote>{item.note && <p>{item.note}</p>}<button onClick={() => setNotes(n => n.filter(x => x.id !== item.id))}>Удалить</button></article>) : <div className="no-notes"><Highlighter/><h3>Здесь пока тихо</h3><p>Выделите фрагмент текста и сохраните его как цитату или заметку.</p></div>}</div>}
    </aside></div>}
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
    let cancelled = false; let task
    const render = async () => {
      try {
        if (!pdfDocuments.has(file)) pdfDocuments.set(file, import('./lib/pdf.js').then(({ openPdf }) => openPdf(file)))
        const pdf = await pdfDocuments.get(file); const pdfPage = await pdf.getPage(number)
        const base = pdfPage.getViewport({ scale: 1 }); const available = Math.max(260, width || wrapRef.current.clientWidth)
        const scale = available / base.width; const viewport = pdfPage.getViewport({ scale })
        const ratio = Math.min(devicePixelRatio || 1, 2); const canvas = canvasRef.current; const context = canvas.getContext('2d')
        canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio)
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`
        task = pdfPage.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio,0,0,ratio,0,0] })
        await task.promise
      } catch (reason) { if (!cancelled && reason?.name !== 'RenderingCancelledException') setError('Не удалось отрисовать страницу') }
    }
    render(); return () => { cancelled = true; task?.cancel() }
  }, [file, number, width])
  return <div ref={wrapRef} className="visual-content pdf-canvas">{error ? <p>{error}</p> : <canvas ref={canvasRef}/>}</div>
}

export default App
