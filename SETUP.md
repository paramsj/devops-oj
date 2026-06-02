# Setup Guide

This guide is the single source of truth for setting up and running the Online Judge locally and in Docker. Follow it step by step.

## 1) Prerequisites

- Node.js v18+ (v20 recommended)
- Docker Engine running and access to /var/run/docker.sock
- A Supabase project (URL + service role key or anon key)

## 2) Repository Layout (Quick Map)

- Backend: server.js, runner.js
- Frontend (React/Vite): frontend/
- Docker compose: docker-compose.yml
- CI/CD: Jenkinsfile, deploy.yml

## 3) Environment Variables

Create a local environment file from the example:

```bash
cp example.env .env
```

Edit .env with your values. The required variables are:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)
- PORT (backend)
- VITE_API_BASE (frontend API base URL)
- FRONTEND_API_BASE (optional: for legacy HTML pages)

Notes:

- Use SUPABASE_SERVICE_ROLE_KEY on the backend only.
- VITE_API_BASE is baked into the frontend build and used by the React app.
- FRONTEND_API_BASE is for non-React pages if you still use them.

## 4) Supabase Schema

Run this SQL in your Supabase SQL editor:

```sql
CREATE TABLE problems (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE testcases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
    input TEXT NOT NULL DEFAULT '',
    expected_output TEXT NOT NULL DEFAULT '',
    is_sample BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
    user_id UUID,
    language TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE submission_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
    testcase_id UUID REFERENCES testcases(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    output TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 5) Install Dependencies

From repo root:

```bash
npm install
```

Frontend:

```bash
cd frontend
npm install
```

## 6) Pull Runtime Images

The backend runs code inside Docker containers:

```bash
docker pull python:3.10-slim
docker pull gcc:latest
```

## 7) Run Locally (Dev)

Backend (from repo root):

```bash
npm run dev
```

Frontend (in another terminal):

```bash
cd frontend
npm run dev
```

Default URLs:

- Backend API: http://localhost:3000
- Frontend (Vite): http://localhost:5173

## 8) Run with Docker Compose

Build and start everything:

```bash
docker compose up --build -d
```

Stop:

```bash
docker compose down
```

Logs:

```bash
docker compose logs -f
```

## 9) Quick API Checks

Create a problem:

```bash
curl -X POST http://localhost:3000/api/problems \
  -H "Content-Type: application/json" \
  -d '{"title": "Sum Two Numbers", "description": "Read two lines and print their sum."}'
```

Add a sample testcase:

```bash
curl -X POST http://localhost:3000/api/problems/<PROBLEM_ID>/testcases \
  -H "Content-Type: application/json" \
  -d '{"input": "1\n2", "expected_output": "3", "is_sample": true}'
```

Execute against samples:

```bash
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"problem_id": "<PROBLEM_ID>", "language": "python", "code": "import sys; a,b = sys.stdin.read().split(); print(int(a)+int(b))"}'
```

## 10) Common Troubleshooting

- Docker socket permission errors: ensure your user can access /var/run/docker.sock.
- No problems returned: confirm Supabase URL/key and tables exist.
- Frontend hitting wrong API: verify VITE_API_BASE in .env and rebuild if using Docker.

## 11) Deployment Notes (EC2 + Ansible)

- Jenkinsfile expects credentials IDs: ec2-public-ip, aws-ec2-key, supabase-url, supabase-key.
- deploy.yml uses docker compose on the target host.
- Ensure the target host user is in the docker group.
