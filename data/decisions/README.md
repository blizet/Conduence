# Publisher decision files

One JSON file = one Kafka delta. Seed loads `dec-trd_*-(open|close).json` in order (**open before close**).

## Dataset (7 positions, 14 files)

| Open | Close | Trade |
|------|-------|-------|
| `dec-trd_001-open` | `dec-trd_001-close` | TRD_001 |
| `dec-trd_004-open` | `dec-trd_004-close` | TRD_004 |
| `dec-trd_006-open` | `dec-trd_006-close` | TRD_006 |
| `dec-trd_008-open` | `dec-trd_008-close` | TRD_008 |
| `dec-trd_009-open` | `dec-trd_009-close` | TRD_009 |
| `dec-trd_011-open` | `dec-trd_011-close` | TRD_011 |
| `dec-trd_013-open` | `dec-trd_013-close` | TRD_013 |

Open-only trades (`TRD_002`, `015`, `016`, `018`, `019`, `020`) are excluded.

Regenerate from batch: `cd backend && npx tsx scripts/sync-open-close-json.ts`
