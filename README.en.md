# English Reading & Paper Translation

English · [中文](README.md) · [Full user guide](docs/USER_GUIDE.en.md) · [中文使用手册](docs/使用手册.md)

A locally run workspace for English reading, vocabulary notes, article-aware AI conversations, and research-paper translation. Papers retain their original PDF layout on the left. Data is saved in the current browser, and the local server listens only on `127.0.0.1`.

![Running reading view with a real NASA article, Chinese translation, and vocabulary](docs/images/02-reading.png)

> The screenshots use real English texts and research papers in an isolated demo browser. Sources and the prepared example translation and conversation are described [at the end of the guide](docs/USER_GUIDE.en.md#sources-shown-in-the-screenshots).

## What you can do

| Task | Workflow |
| --- | --- |
| Read English closely | Add source text to the article library, organize it in folders, compare the translation, and underline saved vocabulary. |
| Build vocabulary | Select text and press **Ctrl+A**, save Chinese meanings and notes, and expand the bundled Longman dictionary when needed. |
| Ask and translate | Translate an article with DeepSeek. Each article has saved assistant conversations with Flash / V4 Pro and thinking controls. |
| Read papers | Import a PDF that saves automatically; use the browser's native PDF viewer on the left and read translated text on the right. Multiple papers can translate concurrently. |

## Run locally

Install **Node.js 24.15+** (or 22.22.2+) and **Git LFS**, then run:

```powershell
git clone https://github.com/LRZer/english-reading-paper-translation.git
cd english-reading-paper-translation
git lfs install
git lfs pull
npm ci
npm start
```

Open **http://127.0.0.1:4173** in a browser and keep the server window running. On Windows, after dependencies are installed, you can also double-click `启动阅读与翻译.cmd`. Opening `index.html` directly cannot use the local dictionary or PDF extraction API and accesses a different browser storage area.

> The Longman `.mdx` and `.mdd` files are managed by Git LFS. If the dictionary is unavailable after cloning, run `git lfs pull` and restart the server.

## A first session

1. Open **Article Library → Add article** and enter a title and English text. Source, folder, translated title, and translation are optional.
2. Open the article, select a word in the source, and press **Ctrl+A**. Record its Chinese meaning and a note in the right pane; expand **Longman Dictionary** if useful.
3. Before using AI, enter a DeepSeek API key in **Settings** and test the connection. Article translation is under **Tools**; the right sidebar has **AI Assistant**.
4. Open **Paper Library**, select **Add paper**, or drop in a PDF. The original appears on the left and translation controls on the right.

The [full illustrated user guide →](docs/USER_GUIDE.en.md) shows each control, state, and troubleshooting step with screenshots from the running app.

| Article and vocabulary | Paper and original PDF |
| --- | --- |
| ![Vocabulary note alongside a sourced article](docs/images/03-vocabulary-note.png) | ![Real research PDF and translation action](docs/images/07-paper-reader.png) |

## AI, PDFs, and local data

- Article and paper translation use separate prompts. You can review and edit an article translation before saving. Paper translation shows its phase and paragraph progress. The article assistant opens on a conversation list so you can resume an old chat or start a new one.
- Paper import supports **English PDFs with a selectable text layer, up to 50 MB each**. Scanned PDFs are not OCR-processed. Figures, tables, and formulas remain in the original PDF; the right pane focuses on extracted body text. Extraction order affects translation quality.
- Articles, vocabulary, folders, and settings use browser `localStorage`; paper PDFs, extraction results, translations, and assistant conversations use `IndexedDB`. AI requests send the relevant article text, extracted paper text, or conversation context to DeepSeek.
- The DeepSeek API key remains in the **current browser** and is not saved in project files or exported backups. The app's JSON backup includes articles, vocabulary, and assistant chats, but **not paper PDFs, extraction results, or translations**. Keep the original paper files separately.

Browser storage can differ when you switch browsers or site addresses. Keep using `127.0.0.1:4173` and regularly export a backup with the **↥** button. See [Backup and restore](docs/USER_GUIDE.en.md#6-back-up-and-restore) for details.

## Development and repository notes

```powershell
npm test
```

`node_modules/`, logs, `.env`, and personal backups are excluded from Git. The default dictionary path is `dictionary/ldoce5/`; alternatively, set `READING_DICTIONARY_DIR` to a directory containing `LDOCE5++ V 1-35.mdx` and `LDOCE5++ V 1-35.mdd`. The bundled PDF text extractor in `vendor/pdfjs-dist` retains its license file.

The repository includes Longman dictionary files. Verify redistribution rights before distributing them publicly. No open-source license has been selected for this project yet.
