# COMPLIANCE TAINT

**Enterprise-Grade Taint Analysis & Compliance Enforcement for LatentGraph**

Banks, fintechs, and SaaS companies operating in regulated environments face a critical blind spot: their codebases contain thousands of microservices communicating via implicit runtime couplings (Kafka, Redis, shared databases). Existing static analysis tools fail to trace data flows across these boundaries.

**COMPLIANCE TAINT** builds on [LatentGraph](https://latentstack.dev) to transform it from a "code understanding tool" into a **regulatory enforcement engine**. By leveraging LatentGraph's ability to detect implicit runtime couplings with 99.8% precision, we perform cross-service taint analysis to catch PCI, GDPR, and RBI compliance violations *before* they reach production.

---

## Key Features

* **Cross-Service Taint Propagation:** Uses Breadth-First Search (BFS) over LatentGraph's dependency graph to track data flows across HTTP, Kafka, Redis, and shared databases.
* **Automated Compliance Zoning:** Enforces data boundaries between regulated zones (`pci`, `gdpr`, `rbi`) and `public` zones.
* **Source/Sink/Sanitizer Architecture:** Automatically tags sensitive data sources, dangerous sinks (logs, external APIs), and safe sanitizers (encryption, masking).
* **Interactive Graph UI:** Visualizes codebases with Cytoscape.js. Tainted data paths pulse in red, while sanitized paths turn green.
* **Automated PDF Reporting:** Generates auditor-ready compliance reports pinpointing the exact code paths, files, and line numbers of regulatory violations.

---

## Architecture & Tech Stack

**Backend (Python / FastAPI)**

* **NetworkX:** In-memory directed graph engine handling BFS label propagation and cycle detection.
* **MCP Client:** Connects to LatentGraph's Model Context Protocol (MCP) server to ingest AST graphs and implicit edges.
* **Engines:** Taint tracking (`taint.py`), node tagging (`tagger.py`), policy evaluation (`policies/evaluator.py`).

**Frontend (React / TypeScript / Vite)**

* **Cytoscape.js:** High-performance force-directed graph visualization.
* **Zustand:** State management for audit, graph, settings, and sidebar data.
* **Tailwind CSS:** Styling for the control panel, violation modals, and file explorer.

---

## Core Compliance Rules (MVP)

1. **PII Logging Violation:** Any data originating from a PII Source node must not reach a Log Sink node without passing through a Sanitizer node (e.g., PAN logged to console without `mask_pan()`).
2. **Cross-Zone Data Leakage:** Any data originating from a highly regulated zone (e.g., `pci`) must not reach a node in an unregulated zone (e.g., `public`) via *any* path, including implicit edges like Kafka.
3. **Secret Exposure via Implicit Channels:** Any data originating from a Secret Source (API keys, tokens) must not flow through an implicit edge to an unauthorized service (e.g., a Stripe webhook key published to a Redis channel).

---

## Getting Started

### Prerequisites

* Python 3.11+
* [Bun](https://bun.sh/) (for frontend dependencies)
* A running instance of LatentGraph with MCP enabled

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run the FastAPI server (default: http://localhost:8000)
uvicorn main:app --reload

```

### Frontend Setup

```bash
cd frontend
bun install

# Run the Vite development server (default: http://localhost:5173)
bun run dev

```

---

## Project Structure

```text
.
├── backend/                   # FastAPI Application
│   ├── api/                   # REST Routes (audit, file, graph, report)
│   ├── engine/                # Taint analysis, zoning, and tagging logic
│   ├── graph/                 # NetworkX graph builder and LatentGraph broker
│   ├── mcp/                   # LatentGraph MCP Client integration
│   ├── policies/              # YAML compliance rules and evaluation engine
│   └── reporting/             # PDF compliance report generator
│
└── frontend/                  # React + Vite Application
    ├── src/
    │   ├── api/               # Axios/Fetch API clients communicating with backend
    │   ├── components/        # UI Components (GraphView, ViolationList, Modals)
    │   ├── pages/             # Dashboard and full-screen Graph views
    │   ├── stores/            # Zustand state management
    │   ├── types/             # TypeScript interfaces
    │   └── utils/             # Data transformation for Cytoscape.js
    └── tailwind.config.js     # UI Styling configuration

```

---

## How It Works (The 4-Step Flow)

1. **Graph Ingestion:** The FastAPI backend connects to LatentGraph via MCP, pulling explicit edges (Function A calls B) and implicit edges (Service X publishes to Kafka topic Y).
2. **Tagging:** The system tags nodes automatically. Handlers reading DBs become `SOURCES`. `logger.info` calls become `SINKS`. `encrypt_aes` functions become `SANITIZERS`.
3. **Taint Propagation:** A BFS algorithm runs from `SOURCES`. If a tainted flow hits a `SINK` without crossing a `SANITIZER`, or if it crosses from a `pci` zone to a `public` zone, a `VIOLATION` is triggered.
4. **Enforcement & Reporting:** The Cytoscape frontend highlights the tainted paths in red. The user is provided with exact files, line numbers, and suggested fixes (e.g., "Add `mask_email()`"). Fixes are applied, the graph is re-run (turning green), and a PDF report is generated for compliance teams.

---

## Hackathon Scope Boundaries

To maintain focus during the 48-hour build, the following are explicitly out of scope for the MVP:

* **No custom AST parsing:** We traverse the graph provided by LatentGraph; we do not parse code ourselves.
* **Rule limitations:** The system enforces exactly three hardcoded YAML policies. A dynamic rule engine is excluded.
* **No auto-fix generation:** We suggest fixes in the UI, but do not automatically rewrite source code.
