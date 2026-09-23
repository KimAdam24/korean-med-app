/**
 * An in-memory file system standing in for expo-file-system's `File`,
 * `Directory` and `Paths`.
 *
 * URIs look like the real ones — `file:///cache/ImagePicker/x.jpg` — so code
 * that inspects them (the picker-copy check, for one) is exercised as it runs
 * on a device. Directories exist implicitly once they hold a file, as on disk.
 *
 * `failDeletes` makes deletes under a prefix throw and leave the file in place,
 * which is the failure the capture path must report rather than hide.
 */
const files = new Map<string, Uint8Array>();
const directories = new Set<string>();
const undeletable: string[] = [];

type PathPart = string | File | Directory;

function join(parts: PathPart[]): string {
  const [first, ...rest] = parts.map((part) => (typeof part === 'string' ? part : part.uri));
  let uri = first ?? '';
  for (const piece of rest) {
    uri = `${uri.replace(/\/+$/, '')}/${piece.replace(/^\/+/, '')}`;
  }
  return uri;
}

function asDirectoryUri(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

function encode(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
}

export class File {
  uri: string;

  constructor(...parts: PathPart[]) {
    this.uri = join(parts).replace(/\/+$/, '');
  }

  get exists(): boolean {
    return files.has(this.uri);
  }

  get size(): number {
    return files.get(this.uri)?.length ?? 0;
  }

  get name(): string {
    return this.uri.slice(this.uri.lastIndexOf('/') + 1);
  }

  async bytes(): Promise<Uint8Array> {
    const content = files.get(this.uri);
    if (!content) throw new Error(`No such file: ${this.uri}`);
    return new Uint8Array(content);
  }

  async text(): Promise<string> {
    return new TextDecoder().decode(await this.bytes());
  }

  async base64(): Promise<string> {
    return Buffer.from(await this.bytes()).toString('base64');
  }

  create(options: { overwrite?: boolean } = {}): void {
    if (files.has(this.uri) && !options.overwrite) throw new Error(`File exists: ${this.uri}`);
    files.set(this.uri, new Uint8Array());
  }

  write(content: string | Uint8Array): void {
    files.set(this.uri, encode(content));
  }

  delete(): void {
    if (!files.has(this.uri)) throw new Error(`No such file: ${this.uri}`);
    if (undeletable.some((prefix) => this.uri.startsWith(prefix))) {
      throw new Error(`Permission denied: ${this.uri}`);
    }
    files.delete(this.uri);
  }

  moveSync(destination: File | Directory, options: { overwrite?: boolean } = {}): void {
    const content = files.get(this.uri);
    if (!content) throw new Error(`No such file: ${this.uri}`);
    const target =
      destination instanceof Directory ? `${asDirectoryUri(destination.uri)}${this.name}` : destination.uri;
    if (files.has(target) && !options.overwrite) throw new Error(`File exists: ${target}`);
    files.delete(this.uri);
    files.set(target, content);
    this.uri = target;
  }
}

export class Directory {
  uri: string;

  constructor(...parts: PathPart[]) {
    this.uri = asDirectoryUri(join(parts));
  }

  get exists(): boolean {
    if (directories.has(this.uri)) return true;
    for (const uri of files.keys()) if (uri.startsWith(this.uri)) return true;
    return false;
  }

  create(_options: { intermediates?: boolean; idempotent?: boolean } = {}): void {
    directories.add(this.uri);
  }

  delete(): void {
    for (const uri of [...files.keys()]) if (uri.startsWith(this.uri)) files.delete(uri);
    directories.delete(this.uri);
  }

  list(): (File | Directory)[] {
    const children = new Map<string, File | Directory>();
    for (const uri of files.keys()) {
      if (!uri.startsWith(this.uri)) continue;
      const rest = uri.slice(this.uri.length);
      const slash = rest.indexOf('/');
      if (slash === -1) children.set(uri, new File(uri));
      else children.set(this.uri + rest.slice(0, slash + 1), new Directory(this.uri + rest.slice(0, slash)));
    }
    return [...children.values()];
  }
}

export class Paths {
  static get cache(): Directory {
    return new Directory('file:///cache/');
  }

  static get document(): Directory {
    return new Directory('file:///document/');
  }
}

export const disk = {
  files,
  reset(): void {
    files.clear();
    directories.clear();
    undeletable.length = 0;
  },
  failDeletes(prefix: string): void {
    undeletable.push(prefix);
  },
  write(uri: string, content: string | Uint8Array = 'x'): void {
    files.set(uri, encode(content));
  },
  under(prefix: string): string[] {
    return [...files.keys()].filter((uri) => uri.startsWith(prefix));
  },
};
