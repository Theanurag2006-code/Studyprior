# Reference only: the earlier Express + PostgreSQL + Prisma design
This folder is an earlier, more heavyweight backend design (Express, Prisma, PostgreSQL). It is **not used by the app**. It could not be installed or run in the environment it was written in, so it was never executed end to end.
The backend the app actually uses is the zero-dependency server in `../../server`, which is tested. Keep this folder if you later want to move to PostgreSQL; its schema, priority rules and security design are documented in `docs/`.
