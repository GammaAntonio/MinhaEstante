process.argv.push("--verify");
await import("./migrate-json-to-postgres.mjs");
