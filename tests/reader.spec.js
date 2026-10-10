import { test, expect } from '@playwright/test'
import { ZipWriter, BlobWriter, TextReader } from '@zip.js/zip.js'

const fb2 = `<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><genre>prose</genre><author><first-name>Иван</first-name><last-name>Автор</last-name></author><book-title>Проверка FB2</book-title><lang>ru</lang></title-info></description><body><section><title><p>Глава первая</p></title><p>Первый абзац книги.</p><p>Второй абзац книги.</p></section></body></FictionBook>`
async function zip(files) {
  const writer = new ZipWriter(new BlobWriter())
  for (const [name, text] of Object.entries(files)) await writer.add(name, new TextReader(text))
  return Buffer.from(await (await writer.close()).arrayBuffer())
}
test('imports FB2 with uppercase extension, EPUB, DOCX, encodings and archives', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Добавить книгу' })).toBeEnabled()
  const result = await page.evaluate(async ({ fb2, epub, docx, fbz }) => {
    const { importBook } = await import('/src/lib/importBook.js')
    const bytes = array => new Uint8Array(array)
    const fixtures = [
      new File([fb2], 'BOOK.FB2'), new File([bytes(epub)], 'book.epub'),
      new File([bytes(docx)], 'book.docx'), new File([bytes(fbz)], 'BOOK.FB2.ZIP'), new File([bytes(fbz)], 'download.zip'),
      new File(['Текст документа'], 'book.txt'), new File(['# Заголовок\n\nТекст'], 'book.md'),
      new File(['<p>Первый</p><p>Второй</p><script>bad</script>'], 'book.html'),
    ]
    return Promise.all(fixtures.map(async file => { try { const book = await importBook(file); return { name: file.name, text: book.text } } catch (e) { return { name: file.name, error: e.message } } }))
  }, { fb2,
    epub: [...await zip({ 'mimetype': 'application/epub+zip', 'META-INF/container.xml': '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>', 'content.opf': '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">test</dc:identifier><dc:title>EPUB</dc:title><dc:language>ru</dc:language></metadata><manifest><item id="ch" href="ch.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch"/></spine></package>', 'ch.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><p>Первый абзац книги.</p><p>Второй абзац книги.</p></body></html>' })],
    docx: [...await zip({ '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', 'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Документ Word</w:t></w:r></w:p></w:body></w:document>' })],
    fbz: [...await zip({ 'readme.txt': 'Read me first', 'folder/BOOK.FB2': fb2 })],
  })
  expect(result.filter(item => item.error)).toEqual([])
  for (const item of result) expect(item.text.length, item.name).toBeGreaterThan(4)
  expect(result[1].text).toBe('Первый абзац книги.\n\nВторой абзац книги.')
})
test('edits a cover, persists it, cancels edits and opens the book', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Изменить обложку/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название', { exact: true }).fill('Моя обложка')
  await dialog.getByLabel('Автор', { exact: true }).fill('Мой автор')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=', 'base64')
  await dialog.getByLabel('Загрузить обложку').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png })
  await expect(dialog.getByRole('button', { name: 'Вернуть текстовую обложку' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Моя обложка', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Открыть Моя обложка', exact: true }).locator('img')).toBeVisible()
  await page.getByRole('button', { name: 'Изменить обложку Моя обложка', exact: true }).click()
  await page.getByLabel('Название', { exact: true }).fill('Отменено')
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Отменено', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Открыть Моя обложка', exact: true }).click()
  await expect(page.locator('.reader-title')).toContainText('Моя обложка')
})
test('a bad file does not stop batch import and errors stay visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Добавить книгу' })).toBeEnabled()
  await page.locator('header input[type=file]').setInputFiles([
    { name: 'empty.epub', mimeType: 'application/epub+zip', buffer: Buffer.from('') },
    { name: 'Хорошая.txt', mimeType: 'text/plain', buffer: Buffer.from('Глава первая\n\nКнига для чтения.') },
  ])
  await expect(page.getByRole('heading', { name: 'Хорошая', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Файл пуст')
  await page.getByRole('button', { name: 'Открыть Хорошая', exact: true }).click()
  await expect(page.locator('.page-left')).toContainText('Книга для чтения.')
})

function pdfFile(text = '') {
  const stream = text ? `BT /F1 18 Tf 50 740 Td (${text}) Tj ET` : '0.5 g 50 50 200 300 re f'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let content = '%PDF-1.4\n'; const offsets = [0]
  objects.forEach((object, i) => { offsets.push(content.length); content += `${i+1} 0 obj\n${object}\nendobj\n` })
  const xref = content.length
  content += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(content)
}
test('opens text and scanned PDFs and draws a scanned page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Добавить книгу' })).toBeEnabled()
  await page.locator('header input[type=file]').setInputFiles([
    { name: 'Текстовый.pdf', mimeType: 'application/pdf', buffer: pdfFile('A readable PDF book with enough text to select text reading mode for this document.') },
    { name: 'Скан.pdf', mimeType: 'application/pdf', buffer: pdfFile() },
  ])
  await expect(page.getByRole('heading', { name: 'Текстовый', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Скан', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Открыть Скан', exact: true }).click()
  await expect.poll(() => page.locator('canvas').first().evaluate(canvas => canvas.getContext('2d').getImageData(10, 10, 1, 1).data[3])).toBe(255)
  await expect(page.locator('.pdf-canvas p')).toHaveCount(0)
})

test('mobile layout, remaining hours, edge taps and touch swipes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Добавить книгу' })).toBeEnabled()
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const boxes = await page.locator('.cover').first().evaluate(cover => {
      const outer = cover.getBoundingClientRect(), title = cover.querySelector('.cover-meta').getBoundingClientRect(), ribbon = cover.querySelector('.cover-ribbon').getBoundingClientRect()
      return { titleHeight: title.height, fits: title.bottom <= outer.bottom && ribbon.right <= outer.right }
    })
    expect(boxes.fits).toBe(true)
    expect(boxes.titleHeight).toBeGreaterThan(0)
    await expect(page.locator('.cover-name').first()).toBeVisible()
    await expect(page.locator('.cover-ribbon').first()).toContainText('Э К С К Л Ю З И В Н А Я')
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.book-grid').screenshot({ path: 'test-results/library-mobile.png', animations: 'disabled' })
  await page.locator('header input[type=file]').setInputFiles({ name: 'Длинная книга.txt', mimeType: 'text/plain', buffer: Buffer.from('Глава первая\n\n' + 'Читаем хорошую книгу. '.repeat(6000)) })
  await page.getByRole('button', { name: 'Открыть Длинная книга', exact: true }).click()
  await expect(page.locator('.reader-title')).toBeVisible()
  await expect(page.getByLabel('Осталось читать')).toContainText('ч')
  const slider = page.getByRole('slider', { name: 'Перейти к странице' })
  await expect(slider).toHaveValue('1')
  const paper = page.locator('.page-left')
  const box = await paper.boundingBox()
  await paper.click({ position: { x: box.width - 10, y: 55 } })
  await expect(slider).toHaveValue('2')
  const cdp = await page.context().newCDPSession(page)
  const swipe = async (x1, y1, x2, y2) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x2, y: y2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await swipe(290, 240, 90, 243)
  await expect(slider).toHaveValue('3')
  await swipe(190, 320, 192, 160)
  await expect(slider).toHaveValue('3')
  await page.getByRole('button', { name: 'Настройки чтения' }).click()
  await page.getByRole('slider', { name: 'Скорость чтения' }).fill('400')
  await expect(page.getByRole('dialog')).toContainText('400')
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Перелистывание' })).toBeInViewport()
  await page.screenshot({ path: 'test-results/reader-mobile.png' })
})
