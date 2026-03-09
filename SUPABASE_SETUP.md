Supabase integration quick setup

1. Create a Supabase project
   - Visit https://app.supabase.com and create a new project.

2. Run the schema SQL
   - Open the SQL editor in Supabase and run:
     - `supabase/schema.sql`

3. Run the student-auth RPC SQL if not already present
   - The current app expects:
     - `register_student`
     - `verify_student`

4. Run the password reset helper SQL if you want Teacher/Admin reissue support
   - Run:
     - `SUPABASE_PASSWORD_RESET_SQL.sql`

5. Add environment variables
   - Create `.env` in the project root:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

6. Install dependencies

```bash
npm install
```

7. Start the app

```bash
npm run dev
```

Important note on student passwords

- Student passwords are stored as bcrypt hashes in `public.users.hashed_password`.
- Supabase does not keep a recoverable plaintext copy.
- The teacher/admin class list can only display plaintext passwords if they still exist in local browser credential cache.
- If the displayed password is blank, reissue it through the UI after running `SUPABASE_PASSWORD_RESET_SQL.sql`.

Important note on project ref

- Make sure the frontend `.env` points to the current active Supabase project.
- This repo was worked against the project ref `rvucxfhufdgbkgwyodff`, not the older empty project.
