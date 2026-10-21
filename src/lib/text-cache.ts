/** LRU cache with a conservative UTF-16 text budget. */
export class TextCache {
	private readonly values = new Map<string, string>();
	private bytes = 0;

	constructor(private readonly maxBytes: number) {}

	get(key: string): string | undefined {
		const value = this.values.get(key);
		if (value !== undefined) {
			this.values.delete(key);
			this.values.set(key, value);
		}

		return value;
	}

	set(key: string, value: string): void {
		const previous = this.values.get(key);
		if (previous !== undefined) {
			this.bytes -= previous.length * 2;
			this.values.delete(key);
		}

		const bytes = value.length * 2;
		if (bytes > this.maxBytes || this.maxBytes <= 0) return;
		while (this.bytes + bytes > this.maxBytes) {
			const oldest = this.values.entries().next().value;
			if (!oldest) break;
			this.bytes -= oldest[1].length * 2;
			this.values.delete(oldest[0]);
		}

		this.values.set(key, value);
		this.bytes += bytes;
	}
}
