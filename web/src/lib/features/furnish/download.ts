export function downloadText(
	filename: string,
	text: string,
	type = 'text/csv;charset=utf-8'
): void {
	const blob = new Blob([text], { type });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.style.display = 'none';
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFilename(name: string): string {
	const cleaned = name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
	return cleaned || 'roomx';
}
