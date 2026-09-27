# User guide

[Project overview](../README.en.md) · [中文使用手册](使用手册.md)

This guide follows the main workflow: add an article, read and collect vocabulary, ask the AI assistant, then import and translate a paper. Every image is a screenshot of the running application. The sample sources and preparation details are listed at the end. The screenshots show the Chinese interface; you can change the interface language in Settings.

## 1. Start the app and configure it

Follow the [startup instructions](../README.en.md#run-locally), then open `http://127.0.0.1:4173`. Keep the server window running. Use the same browser and address when returning to your saved local data; browser storage is separate for each browser and site address.

For AI translation or article questions, open **Settings** in the upper-right corner, enter your own DeepSeek API key, and select **Test connection**. The key remains in this browser's local storage. It is not written into project files or exported backups. Reading, vocabulary notes, and PDF viewing work without an API key.

![Settings panel with language, typography, and reading background controls](images/08-settings.png)

Settings also contains interface language, text sizes, dictionary size, line spacing, page margins, and reading background. Changes apply and save immediately. Scroll down inside the panel for the DeepSeek controls.

## 2. Add and organize articles

1. Open **Article Library** and select **Add article** in the upper-right corner.
2. Enter a title and the English text. Source, folder, translated title, and translation are optional. Blank lines separate paragraphs.
3. Select **Save and start reading**. Later, open the article from its library card.

![Add-article form filled with a sourced English article](images/00-add-article.png)

Use the **+** beside the article-folder heading to create a folder. Each card has a dropdown for moving it. Search by title, source, or text; edit and delete controls are at the bottom of each card. Deleting an article leaves its vocabulary notes in the vocabulary library.

![Article library with two sourced English texts and folders](images/01-article-library.png)

## 3. Read, underline, and keep vocabulary notes

The source text is on the left and that article's vocabulary is on the right. The **Tools** menu in the upper-right corner controls underlining and the translation view, and provides editing and AI translation actions. With underlining enabled, saved words and common inflections receive a black underline; select an underlined word to open its notes.

![Reading view with source paragraphs, translation, and vocabulary](images/02-reading.png)

Select a word or phrase in the source text and press **Ctrl+A** to add it to the article's vocabulary. This shortcut applies to a selection in the article; Ctrl+A in an input retains its normal select-all behavior. A vocabulary entry has a Chinese meaning and a personal note, both saved as you type. The Vocabulary page lets you search all entries or add a standalone word.

![Vocabulary note with source context, meaning, and personal note](images/03-vocabulary-note.png)

Expand **Longman Dictionary** inside a vocabulary entry to use the local dictionary. English definitions appear first. The **Longman 5++** control at the top-right toggles Chinese meanings; supplementary examples and collocations expand on demand. If the dictionary does not load, run `git lfs pull` after cloning.

![Bundled Longman entry within a vocabulary note](images/10-dictionary.png)

## 4. Translate an article and ask the AI assistant

To translate an article, select **Tools → AI Translation** on its reading page. Review the generated Chinese title and text in the preview; you may edit both before saving. Then enable **Tools → Translation** to read the source and translation together. This requires a configured DeepSeek API key.

To ask about an article, switch the right sidebar to **AI Assistant**. It opens on that article's conversation list. Resume an existing conversation or select **New conversation**. Conversations are saved separately for each article.

![AI Assistant opens on the article's saved-conversation list](images/04-assistant-list.png)

Type a question in the composer and select **Send**. The selector in its lower-left corner offers DeepSeek Flash and V4 Pro, a thinking toggle, and reasoning effort. When enabled and returned by the model, reasoning can be expanded in the answer. The assistant receives the current article and this conversation's context; verify important claims against the source.

![Article-aware conversation with the model selector inside the composer](images/05-assistant-chat.png)

## 5. Import and translate paper PDFs

1. Open **Paper Library**, select **Add paper**, or drag a PDF onto the import area. The per-file limit is 50 MB.
2. The PDF is saved to this browser automatically. The app extracts its text for translation. Use the **+** in the folder sidebar to make a paper folder, and a card's dropdown to move a paper.
3. Open a paper card to read it. At the top, you can enter your own paper-date label and change its folder.
4. The left pane uses the browser's native PDF viewer for zooming, searching, and copying selectable text. The right pane holds the translation. With an API key configured, translation starts automatically on import. Otherwise, configure the key and then select **Start translation**.

![Paper library with two real research papers and a folder](images/06-paper-library.png)

![Original PDF on the left and translation action on the right](images/07-paper-reader.png)

During translation, the app reports its phase, paragraph progress, and recent activity. You can return to the library or open another paper; several results can be received and saved concurrently in the same browser. Keep the page and local server running while a translation is in progress. A completed translation reappears in the right pane next time; use **Retranslate** if needed.

Scanned PDFs without a text layer are not OCR-processed. Figures, tables, and formulas remain visible in the original PDF, while the translation focuses on extractable body text. Two-column layouts, footnotes, and formulas can disrupt extraction order and affect the translation.

## 6. Back up and restore

Select the **↥** button in the upper-right corner to open **Data Backup**. Export a JSON backup regularly and keep the downloaded file. **Choose file** merges an earlier backup into the current browser. The backup dialog is also available at the bottom of Settings.

![Backup dialog with export and import actions](images/09-backup.png)

The JSON backup contains articles, vocabulary, folders, settings, and AI assistant conversations. It **does not contain paper PDFs, their extracted text or translations, or the API key**. Keep original paper files separately. Clearing site data, switching browsers, or changing the site address can make the original browser's local data unavailable.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Longman dictionary does not load | Run `git lfs pull` in the project directory, confirm the `.mdx` and `.mdd` files downloaded, then restart the local server. |
| PDF opens but cannot be translated | Check whether you can select text in the PDF. OCR a scanned document with a separate tool before reimporting. |
| AI request fails | Check the API key and **Test connection** in Settings; keep the local server running. |
| Articles disappear in another browser | Return to the original browser at `127.0.0.1:4173`, or import a prior JSON backup. Paper PDFs must be imported again. |
| Translation disagrees with the paper | Inspect the PDF extraction order and compare important passages with the original. |

## Sources shown in the screenshots

The screenshots were captured from the real application in an isolated browser profile, without personal data or a real API key. The English texts come from [NASA Science, *What is an exoplanet?*](https://science.nasa.gov/exoplanets/what-is-an-exoplanet/) and [Charles Darwin's *The Voyage of the Beagle* at Project Gutenberg](https://www.gutenberg.org/ebooks/944). The papers are [DENet (ACCV 2022)](https://openaccess.thecvf.com/content/ACCV2022/html/Qin_DENet_Detection-driven_Enhancement_Network_for_Object_Detection_under_Adverse_Weather_ACCV_2022_paper.html) and [Image-Adaptive YOLO (arXiv)](https://arxiv.org/abs/2112.08088). Only screenshots are committed; the two PDF files are not. The Chinese article translation, vocabulary notes, and example assistant exchange were prepared for documentation and did not call a live API.
