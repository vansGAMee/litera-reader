import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { positiveQuotes, negativePassages } from '../src/lib/ai/quoteDataset.js'
import { extractFeatures, TOTAL_DIMS } from '../src/lib/ai/features.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

console.log(`Preparing dataset: ${positiveQuotes.length} positive, ${negativePassages.length} negative`)

const X = []
const y = []
const texts = []

for (const quote of positiveQuotes) {
  const feat = Array.from(extractFeatures(quote))
  X.push(feat)
  y.push(1.0)
  texts.push({ text: quote, label: 1 })
}

for (const pass of negativePassages) {
  const feat = Array.from(extractFeatures(pass))
  X.push(feat)
  y.push(0.0)
  texts.push({ text: pass, label: 0 })
}

const outPath = path.join(__dirname, 'dataset_tensors.json')
fs.writeFileSync(outPath, JSON.stringify({ dims: TOTAL_DIMS, X, y, texts }, null, 2))
console.log(`Saved dataset with ${X.length} samples to ${outPath}`)
