# AI Agent Workflow Builder (Mini n8n)

A full-stack application for chaining AI agent steps, built with Nhost, Hasura, PostgreSQL, Next.js, and Tailwind CSS.

## Features

- **Visual Workflow Builder**: Create step-by-step automation chains.
- **Multiple Step Types**: LLM calls, HTTP requests, DB writes, Notifications, Conditional branches, and Manual Approval Gates.
- **Multiple Triggers**: Manual UI triggers, inbound Webhooks, Scheduled Cron jobs, and Database events.
- **Real-time Execution View**: Watch workflows execute step-by-step via GraphQL subscriptions.
- **Two-Layer Security**:
  - **Layer 1**: Strict row-level security ensuring users only see their organization's data based on their role (owner, editor, viewer).
  - **Layer 2**: Action-level runtime validation ensuring only owners can configure specific sensitive steps (DB writes, Webhooks), and only authorized roles can approve paused workflows.
- **Quota Enforcement**: Tracks workflow runs against an organizational quota limit.

## Tech Stack

- **Backend**: Nhost (PostgreSQL, Hasura GraphQL Engine, Nhost Auth, Serverless Functions)
- **Frontend**: Next.js 14, React, Tailwind CSS, Apollo Client, `@nhost/nhost-js`
- **AI Integration**: OpenRouter API (`google/gemini-2.0-flash-001` via HTTP)

## Local Development Setup

### Prerequisites
- Node.js v20+
- Docker and Docker Compose
- Nhost CLI (`curl -sSL https://raw.githubusercontent.com/nhost/cli/main/get.sh | bash`)

### 1. Start the Backend
```bash
cd nhost-project
nhost up
```
This will start PostgreSQL, Hasura, Auth, and Storage locally, and apply all migrations and metadata.

### 2. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### Environment Variables
For local development, the frontend will automatically connect to the local Nhost backend. If deploying to Vercel, set these in your Vercel project:

- `NEXT_PUBLIC_NHOST_SUBDOMAIN`: Your Nhost Cloud project subdomain
- `NEXT_PUBLIC_NHOST_REGION`: Your Nhost Cloud project region
- `OPENROUTER_API_KEY`: Your LLM API key (configure this in Nhost Dashboard -> Settings -> Environment Variables)

## Deployment to Nhost Cloud

1. Create a project on [Nhost Cloud](https://nhost.io).
2. Connect this GitHub repository to the project.
3. Nhost will automatically detect the `nhost/` folder and deploy the database schema, Hasura metadata, and serverless functions.
4. Deploy the `frontend/` folder to Vercel and set the `NEXT_PUBLIC_NHOST_SUBDOMAIN` and `NEXT_PUBLIC_NHOST_REGION` environment variables.