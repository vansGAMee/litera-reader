import { useEffect, useState, useMemo, useCallback } from 'react'
import { Check, Compass, Cpu, Heart, RefreshCw, RotateCcw, Sparkles, ThumbsDown, X, BookOpen, Layers } from 'lucide-react'
import { globalDeepModel } from './lib/ai/deepModel.js'
import { extractQuotesFromBook } from './lib/ai/quoteExtractor.js'

export default function QuoteTrainer({ book, onClose, onSaveQuote, onJumpToPage }) {
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [quotes, setQuotes] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [tab, setTab] = useState('deck') // 'deck' | 'list' | 'taste'
  const [reviewed, setReviewed] = useState(new Set())
  const [liked, setLiked] = useState(new Set())
  const [lastAction, setLastAction] = useState(null)
  const [toast, setToast] = useState('')
  const [tasteProfile, setTasteProfile] = useState(() => globalDeepModel.getTasteProfile())
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('score') // 'score' | 'page'

  // Загрузка и извлечение цитат с семантическим анализом всей книги
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setProgress(0)

    extractQuotesFromBook(book, globalDeepModel, {
      onProgress: (p) => {
        if (!cancelled) setProgress(p)
      }
    }).then((extracted) => {
      if (!cancelled) {
        setQuotes(extracted)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [book])

  const refreshTaste = useCallback(() => {
    setTasteProfile(globalDeepModel.getTasteProfile())
  }, [])

  const currentQuote = quotes[currentIndex]

  // Обработка Лайка
  const handleLike = useCallback((quote = currentQuote) => {
    if (!quote) return
    globalDeepModel.learn(quote.text, true)
    setReviewed(prev => new Set(prev).add(quote.id))
    setLiked(prev => new Set(prev).add(quote.id))
    setLastAction({ type: 'like', quote })
    setToast(`Сохранено в заметки · Вкус ИИ обновлён`)

    if (onSaveQuote) {
      onSaveQuote({
        quote: quote.text,
        page: quote.page,
        note: `✨ ${quote.meaningCategory || 'Цитата'} (${quote.percentMatch}% совпадение)`
      })
    }

    refreshTaste()
    setCurrentIndex(i => Math.min(quotes.length, i + 1))
  }, [currentQuote, onSaveQuote, quotes.length, refreshTaste])

  // Обработка "Мимо"
  const handleSkip = useCallback((quote = currentQuote) => {
    if (!quote) return
    globalDeepModel.learn(quote.text, false)
    setReviewed(prev => new Set(prev).add(quote.id))
    setLastAction({ type: 'skip', quote })
    setToast(`Пропущено · ИИ учёл ваши предпочтения`)
    refreshTaste()
    setCurrentIndex(i => Math.min(quotes.length, i + 1))
  }, [currentQuote, quotes.length, refreshTaste])

  // Отмена последнего действия
  const handleUndo = useCallback(() => {
    if (!lastAction) return
    const { quote } = lastAction
    setReviewed(prev => {
      const next = new Set(prev)
      next.delete(quote.id)
      return next
    })
    setLiked(prev => {
      const next = new Set(prev)
      next.delete(quote.id)
      return next
    })
    setCurrentIndex(i => Math.max(0, i - 1))
    setLastAction(null)
    setToast('Действие отменено')
  }, [lastAction])

  // Сброс обучения
  const handleResetTaste = useCallback(() => {
    if (confirm('Сбросить персональное обучение нейросети к заводским весам (CUDA RTX 4060)?')) {
      globalDeepModel.resetPersonalization()
      refreshTaste()
      setToast('Модель сброшена к базовым весам')
    }
  }, [refreshTaste])

  // Горячие клавиши для режима карточек
  useEffect(() => {
    if (tab !== 'deck') return
    const handleKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        handleLike()
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault()
        handleSkip()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [tab, handleLike, handleSkip, onClose])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  // Фильтрация и сортировка списка
  const visibleQuotes = useMemo(() => {
    return quotes.filter(q => {
      if (!search) return true
      return q.text.toLowerCase().includes(search.toLowerCase())
    }).sort((a, b) => {
      if (sortBy === 'page') return a.page - b.page
      return b.combinedScore - a.combinedScore
    })
  }, [quotes, search, sortBy])

  return (
    <div className="quote-trainer-overlay" onClick={onClose}>
      <div className="quote-trainer-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Заголовок */}
        <header className="trainer-header">
          <div className="trainer-brand">
            <span className="trainer-badge"><Sparkles size={16}/> LSQ-Net · ИИ-ЦИТАТНИК</span>
            <h2>{book.title}</h2>
            <small>{book.author}</small>
          </div>
          <button className="trainer-close" onClick={onClose} aria-label="Закрыть цитатник">
            <X size={20}/>
          </button>
        </header>

        {/* Навигация по вкладкам */}
        <nav className="trainer-tabs">
          <button
            className={tab === 'deck' ? 'active' : ''}
            onClick={() => setTab('deck')}
          >
            <Layers size={15}/> Карточки {quotes.length ? `(${Math.min(currentIndex + 1, quotes.length)}/${quotes.length})` : ''}
          </button>
          <button
            className={tab === 'list' ? 'active' : ''}
            onClick={() => setTab('list')}
          >
            <BookOpen size={15}/> Все цитаты ({quotes.length})
          </button>
          <button
            className={tab === 'taste' ? 'active' : ''}
            onClick={() => { refreshTaste(); setTab('taste') }}
          >
            <Cpu size={15}/> Вкус ИИ {tasteProfile.totalRatings ? `(${tasteProfile.totalRatings})` : ''}
          </button>
        </nav>

        {/* Основная область контента */}
        <main className="trainer-body">
          {loading ? (
            <div className="trainer-loading">
              <span className="brand-mark animate-spin">Л</span>
              <h3>Нейросеть LSQ-Net сканирует книгу…</h3>
              <p>Анализ глобального семантического контекста и поиск смысловых пиков на RTX 4060</p>
              <div className="trainer-progress-bar">
                <i style={{ width: `${progress}%` }}/>
              </div>
              <small>{progress}% обработано</small>
            </div>
          ) : quotes.length === 0 ? (
            <div className="trainer-empty">
              <span>∅</span>
              <h3>В тексте не найдено подходящих цитат</h3>
              <p>Возможно, книга состоит только из графических изображений или содержит слишком короткий текст.</p>
            </div>
          ) : tab === 'deck' ? (
            // Режим карточек
            <section className="trainer-deck-view">
              {currentIndex < quotes.length ? (
                <div className="quote-card-stage">
                  <article className="quote-card animate-appear">
                    <div className="quote-ornament">
                      <span className="ornament-corner tl"/>
                      <span className="ornament-corner tr"/>
                      <span className="ornament-corner bl"/>
                      <span className="ornament-corner br"/>
                    </div>

                    <div className="quote-meta-row">
                      <span className="quote-page-tag">
                        Страница ~{currentQuote.page}
                      </span>
                      {currentQuote.meaningCategory && (
                        <span className="quote-meaning-pill" title="Распознанный смысл высказывания">
                          ✨ {currentQuote.meaningCategory}
                        </span>
                      )}
                      <span className="quote-match-pill" title="Вероятность цитаты с учетом вашего вкуса">
                        <Sparkles size={13}/> {currentQuote.percentMatch}% совпадение
                      </span>
                    </div>

                    <blockquote className="quote-text">
                      «{currentQuote.text}»
                    </blockquote>

                    <div className="quote-card-footer">
                      {onJumpToPage && (
                        <button
                          type="button"
                          className="jump-to-page-btn"
                          onClick={() => {
                            onJumpToPage(currentQuote.page - 1)
                            onClose()
                          }}
                        >
                          <Compass size={14}/> Перейти к месту в книге
                        </button>
                      )}
                    </div>
                  </article>

                  {/* Кнопки оценки */}
                  <div className="deck-controls">
                    <button
                      type="button"
                      className="deck-btn btn-skip"
                      onClick={() => handleSkip()}
                      title="Пропустить (клавиша ← или Backspace)"
                    >
                      <ThumbsDown size={20}/>
                      <span>Мимо</span>
                      <kbd>←</kbd>
                    </button>

                    {lastAction && (
                      <button
                        type="button"
                        className="deck-btn btn-undo"
                        onClick={handleUndo}
                        title="Отменить предыдущую оценку"
                      >
                        <RotateCcw size={16}/>
                        <span>Отмена</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="deck-btn btn-like"
                      onClick={() => handleLike()}
                      title="Лайк / Сохранить в заметки (клавиша → или Enter)"
                    >
                      <Heart size={20} fill="#fff"/>
                      <span>Лайк</span>
                      <kbd>→</kbd>
                    </button>
                  </div>

                  <footer className="deck-footer-hint">
                    <span>Горячие клавиши: <b>←</b> Мимо · <b>→</b> Лайк · <b>Esc</b> Закрыть</span>
                  </footer>
                </div>
              ) : (
                <div className="trainer-deck-complete">
                  <div className="complete-icon">✨</div>
                  <h3>Все цитаты просмотрены!</h3>
                  <p>
                    Вы оценили все смысловые пики этой книги. Сохранено в заметки: <b>{liked.size}</b>.
                  </p>
                  <p>Нейросеть откалибровала смысловые головы внимания под ваш вкус.</p>
                  <div className="deck-complete-actions">
                    <button type="button" onClick={() => setCurrentIndex(0)}>
                      <RefreshCw size={15}/> Начать заново
                    </button>
                    <button type="button" className="btn-primary" onClick={onClose}>
                      Вернуться к чтению
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : tab === 'list' ? (
            // Режим полного списка
            <section className="trainer-list-view">
              <div className="list-controls">
                <input
                  type="search"
                  placeholder="Поиск по цитатам…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <div className="sort-toggles">
                  <button
                    className={sortBy === 'score' ? 'active' : ''}
                    onClick={() => setSortBy('score')}
                  >
                    По совпадению
                  </button>
                  <button
                    className={sortBy === 'page' ? 'active' : ''}
                    onClick={() => setSortBy('page')}
                  >
                    По страницам
                  </button>
                </div>
              </div>

              <div className="quotes-scroll-list">
                {visibleQuotes.map((q) => {
                  const isLiked = liked.has(q.id)
                  return (
                    <article key={q.id} className="list-quote-item">
                      <div className="list-quote-head">
                        <small>СТРАНИЦА ~{q.page}</small>
                        <div className="list-badges">
                          {q.meaningCategory && (
                            <span className="quote-meaning-pill sm">
                              {q.meaningCategory}
                            </span>
                          )}
                          <span className="quote-match-pill sm">
                            <Sparkles size={11}/> {q.percentMatch}%
                          </span>
                        </div>
                      </div>
                      <blockquote>«{q.text}»</blockquote>
                      <div className="list-quote-actions">
                        {onJumpToPage && (
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              onJumpToPage(q.page - 1)
                              onClose()
                            }}
                          >
                            <Compass size={13}/> В книгу
                          </button>
                        )}
                        <button
                          type="button"
                          className={`like-toggle-btn ${isLiked ? 'is-liked' : ''}`}
                          onClick={() => handleLike(q)}
                        >
                          <Heart size={14} fill={isLiked ? 'currentColor' : 'none'}/>
                          {isLiked ? 'Сохранено' : 'Лайк'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : (
            // Режим профиля вкуса
            <section className="trainer-taste-view">
              <div className="taste-card">
                <div className="taste-badge-header">
                  <Cpu size={24}/>
                  <div>
                    <h4>Семантическая нейросеть LSQ-Net</h4>
                    <p>Обучена на ядрах CUDA (NVIDIA GeForce RTX 4060)</p>
                  </div>
                </div>

                <div className="taste-stats-grid">
                  <div className="stat-box">
                    <b>{tasteProfile.totalRatings}</b>
                    <span>Всего оценок</span>
                  </div>
                  <div className="stat-box">
                    <b>{tasteProfile.likeCount}</b>
                    <span>Лайков</span>
                  </div>
                  <div className="stat-box">
                    <b>{tasteProfile.skipCount}</b>
                    <span>Мимо</span>
                  </div>
                  <div className="stat-box">
                    <b>{tasteProfile.adaptationPercent || 0}%</b>
                    <span>Калибровка вкуса</span>
                  </div>
                </div>

                <div className="taste-summary-box">
                  <h5>Текущее состояние модели</h5>
                  <p>{tasteProfile.summary}</p>
                </div>

                {tasteProfile.traits && (
                  <div className="taste-traits-box">
                    <h5>Любимые темы и смысловые паттерны:</h5>
                    <div className="traits-pills">
                      {tasteProfile.traits.map((t, idx) => (
                        <span key={idx} className="trait-pill">
                          <Check size={13}/> {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="taste-actions">
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={handleResetTaste}
                  >
                    <RotateCcw size={14}/> Сбросить обучение к заводским весам
                  </button>
                </div>
              </div>
            </section>
          )}
        </main>

        {/* Всплывающее уведомление */}
        {toast && (
          <div className="trainer-toast animate-bounce">
            <Check size={16}/> {toast}
          </div>
        )}
      </div>
    </div>
  )
}
