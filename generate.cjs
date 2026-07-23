const fs = require("fs")
const path = require("path")
const PDFDocument = require("pdfkit")

const INPUT_DIR = path.resolve(__dirname, process.argv[2] || "input")

const today = new Date()
const DATE_STRING = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-")

const OUTPUT_DIR = path.resolve(__dirname, "output", DATE_STRING)
const COMPONENTS_DIR = path.join(OUTPUT_DIR, "components")
const OUTPUT_FILE = path.join(OUTPUT_DIR, "autorskie_materialy.pdf")

const ALLOWED_EXT = new Set([".js", ".jsx", ".ts", ".tsx"])

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFiles(full))
    } else if (ALLOWED_EXT.has(path.extname(entry.name).toLowerCase())) {
      files.push(full)
    }
  }
  return files.sort()
}

if (!fs.existsSync(INPUT_DIR)) {
  console.error(`Input directory not found: ${INPUT_DIR}`)
  process.exit(1)
}

const files = collectFiles(INPUT_DIR)
if (files.length === 0) {
  console.error(`No .js/.jsx/.ts/.tsx files found in ${INPUT_DIR}`)
  process.exit(1)
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true })

fs.rmSync(COMPONENTS_DIR, { recursive: true, force: true })
fs.cpSync(INPUT_DIR, COMPONENTS_DIR, { recursive: true })

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 60, bottom: 60, left: 60, right: 60 },
})

doc.pipe(fs.createWriteStream(OUTPUT_FILE))

const TITLE_FONT = "Helvetica-Bold"
const CODE_FONT = "Courier"
const TITLE_SIZE = 13
const CODE_SIZE = 9
const LINE_GAP = 2

files.forEach((filePath, index) => {
  const name = path.basename(filePath)
  const code = fs.readFileSync(filePath, "utf8").replace(/\t/g, "  ")

  if (index > 0) doc.moveDown(1.5)
  doc.font(TITLE_FONT).fontSize(TITLE_SIZE).text(name, { lineGap: 4 })
  doc.moveDown(0.8)
  doc
    .font(CODE_FONT)
    .fontSize(CODE_SIZE)
    .text(code, {
      lineGap: LINE_GAP,
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    })
})

doc.end()
doc.on("end", () => {
  console.log(`Wrote ${files.length} file(s) to ${OUTPUT_FILE}`)
})
