Supabase integration — quick setup

1) Create a Supabase project
   - Visit https://app.supabase.com and create a new project.

2) Run the SQL schema
   - Open the SQL editor in Supabase and run the contents of `supabase/schema.sql` in this repo.

3) Environment variables (frontend)
   - Add to your local `.env` (Vite) file at project root.
     Make sure the URL matches the *current* project ref you are viewing in
     the Supabase dashboard; in this repo the working project is
     `rvucxfhufdgbkgwyodff` (not the old empty one).

```dotenv
# DO NOT commit actual credentials!
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4) Install the client in this project

```bash
npm install @supabase/supabase-js
```

5) Usage in the app
   - The client wrapper is provided at `src/services/supabaseClient.ts`.
   - Example:

```ts
import { getProgressForStudent, saveProgress } from './src/services/supabaseClient';

const { data, error } = await getProgressForStudent('student-uuid');
```

6) Server-side considerations
   - For privileged operations (creating users, exporting analytics) use Supabase Edge Functions or a private server with the service_role key — never embed service_role in the frontend.

7) Migrations
   - Supabase provides migration tools (supabase cli) or run the SQL once via the dashboard.

If you want, I can:
- Add simple hooks into `src/services` to replace the current mock `authService.ts` and `progressService.ts` with Supabase calls.
- Add a basic serverless function template for privileged analytics queries.
