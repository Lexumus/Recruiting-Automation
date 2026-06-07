# Hiring Automation

An end-to-end hiring pipeline for co-op/intern recruiting. It has two components that work together:

1. **Gmail → Sheets** (`gmail_to_sheets.js`) — a Google Apps Script that watches a Gmail inbox, extracts resume attachments, saves them to Google Drive, and logs each candidate in a Google Sheet.
2. **AI Resume Sorter** (Python) — a conversational AI agent that lets you query the collected resumes using natural language, powered by a RAG pipeline over a LanceDB vector database.

## Architecture

```
Gmail (oce@rit.edu)
    ↓  [Apps Script trigger]
Google Drive folders (per position)
    ↓  [setup.py]
resumes/ → PDF-to-Markdown → resumes_in_md/
    ↓
LanceDB vector DB (resume-rag-db/)
    ↓  [main.py]
Conversational AI agent (CLI)
```

---

## Part 1 — Gmail → Sheets (Apps Script)

### What it does

- Polls Gmail for emails with resume attachments from a configured sender
- Detects the target position from the email subject/body
- Saves the attachment to the matching Google Drive folder
- Logs the candidate (name, email, date, position, resume link, status) in a Google Sheet
- Labels processed emails in Gmail so they aren't re-processed

### Setup

1. Go to [script.google.com](https://script.google.com) and create a new project
2. Paste the contents of `gmail_to_sheets.js`
3. Fill in the `CONFIG` block at the top:
   - `sheetId` — your Google Sheet ID (from the sheet URL)
   - `positions[].folderId` — Google Drive folder ID for each role
   - Adjust `positions[].title` and `tabName` to match your open roles
4. Run `setup()` once manually — this creates the sheet tabs and Gmail labels
5. Run `processResumeEmails` whenever you want to process new emails:
   - **Manually:** select `processResumeEmails` from the function dropdown in the Apps Script editor and click Run
   - **Automatically:** add a time-driven trigger in the Apps Script trigger editor (Triggers → Add Trigger → `processResumeEmails` → time-driven, every 5–10 minutes)

### Positions (default config)

| Short Name | Full Title |
|---|---|
| AI SWE | AI Software Engineer Co-op/Intern |
| ML Engineer | Machine Learning Engineer Co-op/Intern |
| Data/ML Ops | Data/ML Ops Engineer Co-op/Intern |

---

## Part 2 — AI Resume Sorter (Python)

### What it does

- Converts PDF resumes to Markdown locally using [marker-pdf](https://github.com/VikParuchuri/marker)
- Stores each resume as a single row in LanceDB (no chunking — full context preserved)
- Retrieves candidates using **hybrid search** (semantic + full-text) with `LinearCombinationReranker`
- Exposes a conversational CLI where you can ask multi-turn questions about the candidates

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd hiring-automation
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```env
   MODEL=openai                          # or 'gemini'
   OPENAI_API_KEY=<your-openai-api-key>
   GOOGLE_API_KEY=<your-gemini-api-key>  # only if MODEL=gemini
   DB_PATH=./resume-rag-db
   TABLE_NAME=resume_knowledge
   RESUME_DIR=./resumes_in_md
   RELEVANCE_SCORE_THRESHOLD=0.2
   ```

4. **Add resumes**

   Place PDF resumes in the `resumes/` directory. These are typically downloaded from the Google Drive folders populated by the Apps Script.

5. **Initialize the database**
   ```bash
   python setup.py
   ```
   This converts PDFs → Markdown, generates embeddings, and populates LanceDB.

### Usage

```bash
python main.py
```

Example session:
```
>: Find candidates with Python and machine learning experience
>> I found 5 relevant candidates...

>: Which of them have PyTorch experience?
>> Among those, 3 have PyTorch experience...

>: exit
```

---

### Scoring Candidates & Populating the Sheet

The AI agent scores every candidate against the role's job description. Use the scores to manually update the **Status** column in your Google Sheet.

**Step 1 — Request scores for a role**

```
>: Score all candidates for the AI SWE role
>: Score all candidates for the ML Engineer role
>: Score all candidates for the Data/ML Ops role
```

The agent returns each candidate with a fit score (1–10), short notes, and evidence from their resume.

**Step 2 — Update the sheet**

Open your Google Sheet and fill in the **Status** column based on the score:

| Score | Suggested Status |
|---|---|
| 9–10 | Strong Yes |
| 7–8 | Yes |
| 5–6 | Maybe |
| 3–4 | No |
| 1–2 | Strong No |

**Example output:**
```
>: Score all candidates for the Data/ML Ops role

>> Ben Almstead — Fit Score: 7/10
   Notes: Python strong, some Docker, limited cloud
   Evidence: Python projects on GitHub; Docker in skills; no AWS/GCP mentioned

>> Haley Yan — Fit Score: 5/10
   Notes: SQL experience, limited pipeline work
   Evidence: SQL coursework; one ETL project; no CI/CD shown
```

You can also ask follow-up questions before or after scoring:
```
>: Which candidates have Docker experience?
>: Compare the top 3 candidates for ML Engineer
```

### Configuration

Adjust retrieval behavior in `main.py`:

```python
resume_retriever_agent_deps = ResumeRetrieverAgentDependency(
    rag_table_name=rag_db.TABLE_NAME,
    limit=90,          # max resumes to retrieve
    reranker_weight=0.7  # 1.0 = pure semantic, 0.0 = pure keyword
)
```

---

## Project Structure

```
hiring-automation/
├── gmail_to_sheets.js              # Apps Script — Gmail → Drive → Sheets
├── agents/
│   └── resume_sorter_agent.py      # Pydantic AI agent definition
├── helpers/
│   ├── pdf_to_md.py                # PDF → Markdown conversion
│   └── rag_db.py                   # LanceDB setup and retrieval
├── models/
│   ├── resume.py                   # Resume data model
│   └── resume_retriever_agent_dependency.py
├── tools/
│   ├── retrieve_similar_resumes_tool.py
│   └── retrieve_all_resumes_tool.py
├── llm_instructions.md             # System prompt for the AI agent
├── main.py                         # CLI entry point
├── setup.py                        # DB initialization script
├── requirements.txt
├── .env.example
└── resume_sorter_flowchart.drawio.png
```

## Tech Stack

- **AI Framework**: Pydantic AI
- **Vector DB**: LanceDB
- **Embeddings**: OpenAI `text-embedding-ada-002` or Google Gemini
- **PDF Processing**: marker-pdf (local, no API calls)
- **Reranking**: LinearCombinationReranker (hybrid search)
- **Automation**: Google Apps Script (Gmail, Drive, Sheets APIs)
