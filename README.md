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
``

---

# Code Execution and Isolation Strategy

One of the most important design decisions in an Online Judge is selecting a secure and efficient execution environment for running untrusted user programs. Since submitted code may contain malicious logic, infinite loops, or resource-intensive operations, the execution environment must provide strong isolation while maintaining acceptable performance.

The project evaluates three common approaches to container execution.

| Feature | Docker-out-of-Docker (DooD) | Docker-in-Docker (DinD) | gVisor |
|----------|-----------------------------|-------------------------|--------|
| Execution Model | Uses the host Docker daemon through `/var/run/docker.sock` | Runs an independent Docker daemon inside a container | Uses a user-space kernel (`runsc`) to sandbox containers |
| Isolation | Low | Moderate | High |
| Performance | Excellent | Good | Good (minor syscall overhead) |
| Resource Usage | Low | High | Moderate |
| Host Security | Poor | Better than DooD | Excellent |
| Requires `--privileged` | No | Usually Yes | No |
| Suitable for Running Untrusted Code | No | Partially | Yes |

## Docker-out-of-Docker (DooD)

In Docker-out-of-Docker, the runner container mounts the host's Docker socket (`/var/run/docker.sock`) and communicates directly with the host Docker daemon.

```
Runner Container
        │
 docker.sock
        │
        ▼
 Host Docker Daemon
        │
        ▼
Execution Containers
```

This approach has very little overhead because it reuses the host daemon and image cache. However, it introduces significant security concerns.

Since the runner has access to the host Docker daemon, a malicious submission that compromises the runner could potentially:

- Start privileged containers
- Mount host filesystems
- Modify or delete host resources
- Escape container isolation entirely

For an Online Judge where arbitrary user code is executed, this level of access is generally considered unacceptable.

---

## Docker-in-Docker (DinD)

Docker-in-Docker launches a completely separate Docker daemon inside the runner container.

```
Runner Container
    Docker Daemon
         │
         ▼
 Execution Containers
```

Because the inner daemon is isolated from the host daemon, child containers are managed independently.

Advantages include:

- Better isolation than DooD
- Independent image management
- Clean execution environments

However, DinD commonly requires the parent container to run with the `--privileged` flag. While this simplifies nested container management, it grants broad kernel capabilities and weakens the overall security boundary.

Additionally, running a full Docker daemon inside another container increases CPU, memory, and storage overhead.

DinD is widely used for CI/CD pipelines but is generally not the preferred solution for executing untrusted user submissions.

---

## gVisor

gVisor is a container runtime developed by Google that provides an additional security layer between containers and the host kernel.

```
Application
      │
System Calls
      │
   gVisor Sentry
      │
 Host Linux Kernel
```

Instead of allowing containers to invoke the host kernel directly, gVisor intercepts and emulates many Linux system calls within a user-space kernel known as the **Sentry**.

This significantly reduces the attack surface exposed to potentially malicious workloads.

Advantages include:

- Strong syscall isolation
- Reduced kernel attack surface
- No privileged containers required
- Native integration with Docker through the `runsc` runtime
- Fast startup compared to virtual machines

The primary trade-off is a modest performance overhead for system-call-intensive workloads. However, for most programming contest submissions, this overhead is negligible compared to the security benefits.

---

# Recommended Approach

For an Online Judge, security is significantly more important than maximizing raw execution speed. User programs are inherently untrusted and must not be allowed to compromise the host system.

Among the evaluated approaches:

- **Docker-out-of-Docker** offers the best performance but exposes the host Docker daemon, making it unsuitable for executing untrusted code.
- **Docker-in-Docker** improves isolation but typically depends on privileged containers, which still present security concerns and introduce additional resource overhead.
- **gVisor** provides the strongest balance between isolation, security, and performance by inserting a lightweight user-space kernel between the application and the host operating system.

For these reasons, **gVisor is the recommended runtime for production deployments of the Online Judge**, while Docker-in-Docker may still be useful for isolated testing or CI environments where privileged execution is acceptable.`
