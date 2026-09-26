# English Reading & Paper Translation

English | [中文](README.md)

A local tool for reading English articles, keeping vocabulary notes, and translating research papers. Articles and vocabulary are stored in the browser; paper PDFs, extracted text, and translations are stored in the browser's IndexedDB. The server listens only on `127.0.0.1`.

## Getting started

Install Node.js and Git LFS, then clone the repository and run:

```powershell
git lfs install
git lfs pull
npm ci
npm start
```

On Windows, you can also double-click `启动阅读与翻译.cmd` after installing dependencies. Open `http://127.0.0.1:4173` in your browser. Use the same browser and address to access your existing local data. Opening `index.html` directly uses a different browser storage area and cannot access the local dictionary or paper extraction API.

## Features

- Separate article and paper libraries, both with folders.
- Select words while reading, record Chinese meanings and notes, and underline saved words and common inflections in the article.
- Switch the reading sidebar to an article-aware AI assistant for follow-up questions. Choose DeepSeek Flash or V4 Pro, turn thinking on or off, set reasoning effort, and inspect the returned reasoning when enabled. Conversations stay separate for each article during the current page session.
- Read the original PDF in the browser's built-in viewer on the left and the full translation on the right. Multiple papers can be translated concurrently, and results are saved even if you leave the current paper.
- Separate DeepSeek prompts for articles and papers. Enter an API key in Settings and test the connection. The key is stored only in this browser's local storage, not in project files or data exports.
- Adjust the reading background, font size, line spacing, page margins, and dictionary font size.
- Consult the bundled local Longman dictionary from a vocabulary entry. Its large files are managed with Git LFS; run `git lfs pull` after cloning or the dictionary will not load. Alternatively, set `READING_DICTIONARY_DIR` to a directory containing `LDOCE5++ V 1-35.mdx` and `LDOCE5++ V 1-35.mdd`.

Paper import supports English PDFs with a selectable text layer. Images, tables, and formulas remain visible in the original PDF on the left; scanned PDFs are not OCR-processed. Translation uses text extracted from the PDF, so extraction quality affects the result. AI translation sends article text or extracted paper text to DeepSeek. Asking the article assistant sends the current article and conversation context.

## Local data and backups

Articles, vocabulary, folders, and settings are stored in the browser's localStorage. Paper PDFs, extracted text, and translations are stored in IndexedDB. The `保留的数据/` directory contains private backups and is excluded from Git. Clearing browser data deletes these records, so export backups from the app regularly.

## Development and repository notes

```powershell
npm test
```

The `.gitattributes` file routes dictionary `.mdx` and `.mdd` files through Git LFS; `git lfs ls-files` should list both files. `.gitignore` excludes `node_modules/`, private backups, logs, and `.env` files. This public repository includes the dictionary files; verify that you have permission to redistribute them.

The bundled `vendor/pdfjs-dist` is used to extract PDF text, and its license is included in that directory. No open-source license has been selected for this project yet.
