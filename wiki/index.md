# Wiki Index

## Two users, two trees

| User | Agent | graph_id | Kafka |
|------|-------|----------|-------|
| **user_117** (publisher) | `user_117.publisher` | `user_117.publisher.v1` | `market.signals.public` (Gemini batch) |
| **User_902** (seeker) | `user_902.seeker` | `user_902.seeker.v1` | same topic — SeekerWorker verify + MERGE |

Publisher tree: user_117 → agent / protocol → market → trade (CoT) → outcome. Source: `gemini-code-1780575064729.json`.

Seeker tree: User_902 → seeker agent → observation branches (one per publisher CoT).

Env: `COT_PUBLISHER_USER_ID`, `COT_SEEKER_USER_ID` in `backend/.env`.

```powershell
npm run clear-all && docker compose up -d
npm run dev:backend
npm run sync-gemini
npm run seed
npm run publisher-agent
```
