# Three kinds of memory for a personal CFO agent

*Draft — operator publishes*

## Episodic

Every action becomes an `events` row: type + JSON payload + timestamp. The agent doesn't need to remember — SQLite does. Reflection jobs scan this.

## Semantic

`facts` table: key-value store for stable truths — recipient names, account labels, preferred categories. Agent updates via tools; operator can inspect in DB.

## Procedural

Learned routines (e.g. "every Monday buy 5k airtime") are **never auto-applied**. Reflection surfaces them as suggested rules in the weekly report for operator approval. This keeps the agent from drifting into unsanctioned automation.

## Implementation

`src/memory/reflection.ts` generates daily/weekly reports from episodic events + audit log. Procedural suggestions are appended to the report as markdown bullets marked `PENDING_APPROVAL`.
