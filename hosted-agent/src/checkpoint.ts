import { open, rename, readFile, mkdir, rmdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { checkpointSchema, type Checkpoint, type CheckpointStore } from "./contracts.js";

/** Private local storage, atomic replace; caller must hold the exclusive lease. */
export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly path: string) {}
  async load() {
    try { return checkpointSchema.parse(JSON.parse(await readFile(this.path, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw new Error("checkpoint_invalid"); }
  }
  async save(state: Checkpoint) {
    const safe = checkpointSchema.parse(state); // allowlist: never serialize bearer, source, plan or raw error.
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temp = `${this.path}.${process.pid}.tmp`;
    const file = await open(temp, "wx", 0o600);
    try { await file.writeFile(JSON.stringify(safe)); await file.sync(); } finally { await file.close(); }
    await rename(temp, this.path);
    const directory = await open(dirname(this.path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const lock = `${this.path}.lock`;
    try { await mkdir(lock, { mode: 0o700 }); } catch { throw new Error("checkpoint_locked"); }
    try {
      const file = await open(`${lock}/owner`, "wx", 0o600);
      try { await file.writeFile(String(process.pid)); } finally { await file.close(); }
      return await work();
    } finally { await unlink(`${lock}/owner`); await rmdir(lock); }
  }
}
