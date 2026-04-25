# Remote Code Execution

A High-Performance API-centric Remote Code Execution Backend using Node.js, Express, Supabase, and Docker-out-of-Docker (DooD).

## Prerequisites

- **Node.js**: v18+
- **Docker**: Must be running and your environment must have permissions to access `/var/run/docker.sock`.
- **Supabase**: A Supabase project initialized.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Pull Docker Images**
   This RCE backend runs Python and C++ inside isolated containers. Pull the required images:
   ```bash
   docker pull python:3.10-slim
   docker pull gcc:latest
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory and add the following context based on your Supabase project:
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   PORT=3000
   ```
   *Note: Using the `SERVICE_ROLE_KEY` bypasses RLS policies. It's safe on the backend as long as the key is not exposed to the client. Alternatively, you can use the `ANON_KEY` if RLS allows inserts.*

4. **Initialize Supabase Schema**
   Run the following SQL in your Supabase SQL Editor to create the necessary tables:

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
       user_id UUID, -- Optional
       language TEXT NOT NULL,
       code TEXT NOT NULL,
       status TEXT NOT NULL, -- AC, WA, TLE, RE, CE
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

## Running the Server

Start the development server with live reload enabled:
```bash
npm run dev
```

Or start normally:
```bash
npm start
```

## Docker Compose (No Nginx)

Run backend and frontend together with one command:

```bash
docker compose up --build -d
```

Stop everything:

```bash
docker compose down
```

Logs:

```bash
docker compose logs -f
```

Ports:

- Backend API: `http://localhost:3000`
- Frontend: `http://localhost:5173`

For EC2/public deployment, set the frontend API URL before build:

```bash
export VITE_API_BASE=http://<your-ec2-public-dns-or-ip>:3000
docker compose up --build -d
```

The compose setup mounts `/var/run/docker.sock` into backend so `dockerode` can create runner containers.

## React Frontend (New)

The old HTML pages are now ported into a React app under [frontend](frontend).

1. Install frontend dependencies:
```bash
cd frontend
npm install
```

2. Start React dev server:
```bash
npm run dev
```

You can also run these from project root:
```bash
npm run frontend:dev
npm run frontend:build
npm run frontend:preview
```

Default frontend URL (Vite): `http://localhost:5173`.
It calls backend APIs at `http://localhost:3000`.

## API Testing Reference

### Create a Problem
```bash
curl -X POST http://localhost:3000/api/problems \
-H "Content-Type: application/json" \
-d '{"title": "Sum Two Numbers", "description": "Write a python script that reads two lines and prints their sum."}'
```
*(Copy the generated `id` UUID for the next steps)*

### Create Testcases for Problem
```bash
# Add sample testcase
curl -X POST http://localhost:3000/api/problems/<PROBLEM_ID>/testcases \
-H "Content-Type: application/json" \
-d '{"input": "1\n2", "expected_output": "3", "is_sample": true}'

# Add hidden testcase
curl -X POST http://localhost:3000/api/problems/<PROBLEM_ID>/testcases \
-H "Content-Type: application/json" \
-d '{"input": "100\n200", "expected_output": "300", "is_sample": false}'
```

### Try Execution (Immediate Result)
Only executes against `is_sample=true`.
```bash
curl -X POST http://localhost:3000/api/execute \
-H "Content-Type: application/json" \
-d '{
  "problem_id": "<PROBLEM_ID>",
  "language": "python",
  "code": "import sys; a, b = sys.stdin.read().split(); print(int(a) + int(b))"
}'
```

### Submit Code (Overall Verdict & Check Supabase)
Executes against all testcases and computes AC, WA, TLE, RE.
```bash
curl -X POST http://localhost:3000/api/submit \
-H "Content-Type: application/json" \
-d '{
  "problem_id": "<PROBLEM_ID>",
  "language": "python",
  "code": "import sys; a, b = sys.stdin.read().split(); print(int(a) + int(b))",
  "user_id": null
}'
```
