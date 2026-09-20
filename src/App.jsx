import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, ChevronDown, Clock3, Focus, Heart, Highlighter, Library, Menu, Minus, MoreHorizontal, Plus, Search, Settings2, StickyNote, Upload, X } from 'lucide-react'
import { get, set } from 'idb-keyval'
import { seedBooks } from './data.js'
import { estimateMinutes, getInitials, paginate, readingProgress } from './lib/reader.js'
import { importBook } from './lib/importBook.js'

const STORAGE_KEY = 'litera-library-v1'
const paletteNames = ['Терракотовая', 'Прусская', 'Оливковая']

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
  const fileRef = useRef(null)

  useEffect(() => { get(STORAGE_KEY).then((saved) => saved?.length && setBooks(saved)) }, [])
  useEffect(() => { set(STORAGE_KEY, books) }, [books])
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2600); return () => clearTimeout(id) }, [toast])

  const visible = useMemo(() => books.filter((book) => {
    const matches = `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase())
    return matches && (filter === 'all' || (filter === 'reading' && book.progress > 0 && book.progress < 100) || (filter === 'favorite' && book.favorite))
  }).sort((a, b) => sort === 'author' ? a.author.localeCompare(b.author, 'ru') : sort === 'title' ? a.title.localeCompare(b.title, 'ru') : b.progress - a.progress), [books, query, filter, sort])

  const openBook = (id) => { setActiveId(id); setView('reader'); window.scrollTo(0, 0) }
  const patchBook = (id, patch) => setBooks((all) => all.map((book) => book.id === id ? { ...book, ...patch } : book))
  const handleFiles = async (files) => {
    setUploading(true)
    try {
      const imported = []
      for (const file of [...files]) imported.push(await importBook(file))
      setBooks((current) => [...imported, ...current]); setToast(`Добавлено книг: ${imported.length}`)
    } catch (error) { setToast(error.message) } finally { setUploading(false) }
  }

  if (view === 'reader') return <Reader book={books.find((book) => book.id === activeId) || books[0]} onBack={() => setView('library')} onChange={patchBook} />

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setView('library')}><span className="brand-mark">Л</span><span><b>Л И Т Е Р А</b><i>личное собрание</i></span></button>
      <nav><button className="active"><Library size={16}/>Библиотека</button><button onClick={() => visible[0] && openBook(visible[0].id)}><BookOpen size={16}/>Читать</button></nav>
      <div className="top-actions"><button className="upload-button" onClick={() => fileRef.current?.click()}><Upload size={16}/><span>{uploading ? 'Обработка…' : 'Добавить книгу'}</span></button><button className="icon-button mobile"><Menu/></button></div>
      <input ref={fileRef} hidden multiple type="file" accept=".epub,.fb2,.txt,.pdf" onChange={(e) => handleFiles(e.target.files)} />
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
        <div className="tools"><label className="search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Автор или название"/><kbd>⌘ K</kbd></label><label className="select">Сортировка:<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">по прогрессу</option><option value="author">по автору</option><option value="title">по названию</option></select><ChevronDown size={14}/></label></div>
      </section>
      <div className="filters">
        {[['all','Все издания'],['reading','Читаю сейчас'],['favorite','Избранное']].map(([key,label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}<sup>{key === 'all' ? books.length : key === 'reading' ? books.filter(b => b.progress > 0 && b.progress < 100).length : books.filter(b => b.favorite).length}</sup></button>)}
      </div>

      {visible.length ? <div className="book-grid">{visible.map((book, index) => <article className="book-card" key={book.id} style={{ '--delay': `${index * 45}ms` }}>
        <div className="book-stage"><Cover book={book} onClick={() => openBook(book.id)}/><button className={`favorite ${book.favorite ? 'on' : ''}`} onClick={() => patchBook(book.id, { favorite: !book.favorite })} aria-label="В избранное"><Heart size={16} fill={book.favorite ? 'currentColor' : 'none'}/></button></div>
        <div className="book-info"><div><h3>{book.title}</h3><p>{book.author}</p></div><button><MoreHorizontal/></button></div>
        <div className="progress-row"><span><i style={{ width: `${book.progress}%` }}/></span><small>{book.progress ? `${book.progress}%` : 'Не начато'}</small></div>
      </article>)}</div> : <div className="empty"><span>∅</span><h3>На этой полке пока пусто</h3><p>Измените фильтр или добавьте свою книгу.</p></div>}

      <button className="dropzone" onClick={() => fileRef.current?.click()}><Upload/><span><b>Пополнить собрание</b><small>Перетащите EPUB, FB2, TXT или PDF · файлы не покидают устройство</small></span><strong>Выбрать файл</strong></button>
    </main>
    <footer><span>ЛИТЕРА / ЦИФРОВОЕ СОБРАНИЕ</span><i>Частное чтение. Без подписки.</i><span>Все данные хранятся локально</span></footer>
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>
}

function Reader({ book, onBack, onChange }) {
  const [fontSize, setFontSize] = useState(+localStorage.getItem('litera-font') || 19)
  const [theme, setTheme] = useState(localStorage.getItem('litera-theme') || 'paper')
  const [page, setPage] = useState(Math.max(0, Math.round((book.progress || 0) / 100 * 10)))
  const [panel, setPanel] = useState(null)
  const [focus, setFocus] = useState(false)
  const [notes, setNotes] = useState(book.notes || [])
  const [selected, setSelected] = useState('')
  const pageSize = fontSize >= 22 ? 1150 : fontSize <= 17 ? 2000 : 1550
  const pages = useMemo(() => paginate(book.text || '', pageSize), [book.text, pageSize])
  const isPdf = book.kind === 'pdf'
  const current = Math.min(page, Math.max(0, pages.length - 1))
  const pct = readingProgress(current + 1, pages.length)
  const remaining = estimateMinutes(pages.slice(current + 1).join(' '))
  const blobUrl = useMemo(() => book.blob ? URL.createObjectURL(book.blob) : null, [book.blob])

  useEffect(() => () => blobUrl && URL.revokeObjectURL(blobUrl), [blobUrl])
  useEffect(() => { localStorage.setItem('litera-font', fontSize); localStorage.setItem('litera-theme', theme) }, [fontSize, theme])
  useEffect(() => { onChange(book.id, { progress: pct, notes }) }, [current, notes])
  useEffect(() => {
    const keys = (e) => {
      if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setPage(p => Math.min(p + 2, pages.length - 1)) }
      if (e.key === 'ArrowLeft') setPage(p => Math.max(0, p - 2))
      if (e.key.toLowerCase() === 'f') setFocus(v => !v)
      if (e.key === 'Escape') setPanel(null)
    }
    addEventListener('keydown', keys); return () => removeEventListener('keydown', keys)
  }, [pages.length])

  const captureSelection = () => { const text = window.getSelection()?.toString().trim(); if (text) setSelected(text) }
  const addNote = () => { if (!selected) return; const note = prompt('Заметка к цитате (можно оставить пустой):') ?? ''; setNotes((all) => [{ id: Date.now(), quote: selected, note, page: current + 1 }, ...all]); setSelected(''); window.getSelection()?.removeAllRanges() }

  return <div className={`reader theme-${theme} ${focus ? 'is-focus' : ''}`} style={{ '--reading-size': `${fontSize}px` }}>
    <header className="reader-top">
      <button className="reader-brand" onClick={onBack}><span>Л</span><i>ЛИТЕРА</i></button>
      <button className="back" onClick={onBack}><ArrowLeft size={17}/> Библиотека</button>
      <div className="reader-title"><b>{book.title}</b><span>{book.author}</span></div>
      <div className="reader-actions"><button onClick={() => setFocus(!focus)} title="Режим фокуса (F)"><Focus size={18}/></button><button onClick={() => setPanel(panel === 'notes' ? null : 'notes')}><StickyNote size={18}/><span>{notes.length}</span></button><button onClick={() => setPanel(panel === 'settings' ? null : 'settings')}><Settings2 size={18}/></button></div>
    </header>
    <div className="reader-status"><span><b>{String(current + 1).padStart(3,'0')}</b> / {String(pages.length).padStart(3,'0')}</span><div><i style={{ width: `${pct}%` }}/></div><span><Clock3 size={14}/> {remaining ? `≈ ${remaining} мин до конца` : 'последняя страница'}</span></div>

    <main className="reading-desk">
      {isPdf ? <iframe className="pdf-view" src={blobUrl} title={book.title}/> : <div className="spread" onMouseUp={captureSelection}>
        <div className="paper page-left"><div className="running"><span>{book.author}</span><em>ЛИТЕРА · ЛИЧНОЕ СОБРАНИЕ</em></div><PageText text={pages[current]} first={current === 0}/><div className="folio"><span>{current + 1}</span><i>{book.title}</i></div></div>
        <div className="paper page-right"><div className="bookmark-ribbon"/><div className="running"><em>ЭКСКЛЮЗИВНАЯ КЛАССИКА</em><span>{book.title}</span></div><PageText text={pages[current + 1] || ''}/><div className="folio"><i>{book.author}</i><span>{Math.min(current + 2, pages.length)}</span></div></div>
      </div>}
      {!isPdf && <><button className="page-nav prev" disabled={current === 0} onClick={() => setPage(p => Math.max(0, p - 2))}><ArrowLeft/></button><button className="page-nav next" disabled={current >= pages.length - 2} onClick={() => setPage(p => Math.min(p + 2, pages.length - 1))}><ArrowRight/></button></>}
      {selected && <button className="selection-action" onMouseDown={(e) => e.preventDefault()} onClick={addNote}><Highlighter size={15}/> Сохранить цитату</button>}
    </main>
    <footer className="reader-bottom"><span><i className="live"/> Режим чтения</span><span>Шрифт: EB Garamond · {fontSize}px</span><button onClick={() => setPanel('notes')}><Bookmark size={15}/> Заметки и цитаты · {notes.length}</button><span className="shortcuts">← → листать · F фокус</span></footer>

    {panel && <div className="panel-backdrop" onClick={() => setPanel(null)}><aside className="side-panel" onClick={(e) => e.stopPropagation()}><div className="panel-head"><div><small>{panel === 'settings' ? 'ВИД ИЗДАНИЯ' : 'ПОЛЯ ЧИТАТЕЛЯ'}</small><h2>{panel === 'settings' ? 'Настройки чтения' : 'Заметки и цитаты'}</h2></div><button onClick={() => setPanel(null)}><X/></button></div>
      {panel === 'settings' ? <div className="settings-list"><section><label>Кегль текста <b>{fontSize}px</b></label><div className="stepper"><button onClick={() => setFontSize(Math.max(15,fontSize-1))}><Minus/></button><span>Аа</span><button onClick={() => setFontSize(Math.min(25,fontSize+1))}><Plus/></button></div></section><section><label>Оттенок бумаги</label><div className="themes">{[['paper','Слоновая кость'],['white','Белый лист'],['sepia','Сепия'],['night','Ночной']].map(([key,label]) => <button key={key} onClick={() => setTheme(key)} className={`${key} ${theme === key ? 'active' : ''}`}><i/>{label}</button>)}</div></section><section className="quiet"><Focus/><div><b>Тихий режим</b><p>Нажмите F — всё лишнее исчезнет, останется только книга.</p></div></section></div> : <div className="notes-list">{notes.length ? notes.map((item) => <article key={item.id}><small>СТРАНИЦА {item.page}</small><blockquote>«{item.quote}»</blockquote>{item.note && <p>{item.note}</p>}<button onClick={() => setNotes(n => n.filter(x => x.id !== item.id))}>Удалить</button></article>) : <div className="no-notes"><Highlighter/><h3>Здесь пока тихо</h3><p>Выделите фрагмент текста и сохраните его как цитату или заметку.</p></div>}</div>}
    </aside></div>}
  </div>
}

function PageText({ text, first }) {
  const blocks = text.split(/\n{2,}/).filter(Boolean)
  return <div className="page-content">{first && <div className="chapter"><small>КНИГА ПЕРВАЯ</small><h1>{blocks.shift() || 'Начало'}</h1><span/></div>}{blocks.map((p,i) => <p key={i}>{p}</p>)}</div>
}

export default App
