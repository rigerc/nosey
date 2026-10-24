import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

type TreeEntry = {name: string; mode: '100644' | '100755' | '40000'; oid: string};

function objectId(type: 'blob' | 'tree', content: Buffer): string {
  return createHash('sha1').update(`${type} ${content.length}\0`).update(content).digest('hex');
}

function treeId(entries: TreeEntry[]): string {
  entries.sort((left, right) => {
    const a = left.name + (left.mode === '40000' ? '/' : '');
    const b = right.name + (right.mode === '40000' ? '/' : '');

    return Buffer.compare(Buffer.from(a), Buffer.from(b));
  });

  const content = Buffer.concat(
    entries.map((entry) =>
      Buffer.from(
        `${entry.mode} ${entry.name}\0${Buffer.from(entry.oid, 'hex').toString('binary')}`,
        'binary',
      ),
    ),
  );

  return objectId('tree', content);
}

/** Compute the SHA-1 Git tree ID of an extracted archive without invoking Git. */
export async function computeTemplateContentTree(directory: string): Promise<string> {
  async function visit(current: string): Promise<string> {
    const entries: TreeEntry[] = [];

    for (const item of await fs.readdir(current, {withFileTypes: true})) {
      if (item.isSymbolicLink()) throw new Error('Template content tree contains a symlink');
      const filename = path.join(current, item.name);

      if (item.isDirectory()) {
        entries.push({name: item.name, mode: '40000', oid: await visit(filename)});
      } else if (item.isFile()) {
        const stat = await fs.stat(filename);
        const bytes = await fs.readFile(filename);
        entries.push({
          name: item.name,
          mode: stat.mode & 0o111 ? '100755' : '100644',
          oid: objectId('blob', bytes),
        });
      } else {
        throw new Error('Template content tree contains an unsupported filesystem entry');
      }
    }

    return treeId(entries);
  }

  return visit(directory);
}
