import { test, expect } from '@playwright/test'

test('AI quote trainer opens, scores quotes, learns from likes and skips, and updates taste profile', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Добавить книгу' })).toBeEnabled()

  // 1. Проверяем наличие кнопки Цитаты ИИ на карточке первой книги на полке
  const aiShelfBtn = page.getByRole('button', { name: /Цитатник ИИ: Братья Карамазовы/ }).first()
  await expect(aiShelfBtn).toBeVisible()

  // Открываем модальное окно ИИ-цитатника
  await aiShelfBtn.click()

  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('heading', { name: 'Братья Карамазовы' })).toBeVisible()

  // 2. Дожидаемся анализа и отображения карточки цитаты
  const quoteText = modal.locator('.quote-text')
  await expect(quoteText).toBeVisible({ timeout: 5000 })
  const initialText = await quoteText.innerText()
  expect(initialText.length).toBeGreaterThan(10)

  // Проверяем наличие бейджа совпадения со вкусом
  await expect(modal.locator('.quote-match-pill').first()).toBeVisible()

  // 3. Нажимаем кнопку "Лайк"
  const likeBtn = modal.getByRole('button', { name: 'Лайк' })
  await likeBtn.click()

  // Проверяем тост об обновлении вкуса ИИ
  await expect(modal.locator('.trainer-toast')).toContainText('Вкус ИИ обновлён')

  // 4. Нажимаем кнопку "Мимо" на следующей цитате
  const skipBtn = modal.getByRole('button', { name: 'Мимо' })
  await skipBtn.click()
  await expect(modal.locator('.trainer-toast')).toContainText('ИИ учёл ваши предпочтения')

  // 5. Переходим на вкладку "Вкус ИИ"
  await modal.getByRole('button', { name: /Вкус ИИ/ }).click()
  await expect(modal.getByText('Нейросетевая персонализация')).toBeVisible()
  await expect(modal.getByText('NVIDIA GeForce RTX 4060')).toBeVisible()
  await expect(modal.locator('.stat-box b').first()).toContainText('2') // Всего 2 оценки (1 лайк, 1 мимо)

  // 6. Переходим на вкладку "Все цитаты"
  await modal.getByRole('button', { name: /Все цитаты/ }).click()
  await expect(modal.locator('.list-quote-item').first()).toBeVisible()

  // 7. Закрываем модальное окно
  await modal.getByRole('button', { name: 'Закрыть цитатник' }).click()
  await expect(modal).toHaveCount(0)

  // 8. Открываем книгу в читалке и проверяем кнопку ИИ в шапке
  await page.getByRole('button', { name: 'Открыть Братья Карамазовы' }).first().click()
  await expect(page.locator('.reader-title')).toContainText('Братья Карамазовы')

  const readerAiBtn = page.getByRole('button', { name: 'ИИ-Цитатник' })
  await expect(readerAiBtn).toBeVisible()
  await readerAiBtn.click()

  const readerModal = page.getByRole('dialog')
  await expect(readerModal).toBeVisible()

  // Проверяем кнопку перехода к месту в книге
  const jumpBtn = readerModal.locator('.jump-to-page-btn')
  if (await jumpBtn.isVisible()) {
    await jumpBtn.click()
    await expect(readerModal).toHaveCount(0)
  }
})
