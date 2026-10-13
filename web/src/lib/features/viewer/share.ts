export async function saveImage(blob: Blob, name: string): Promise<void> {
	const fileName = `${name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'roomx'}-3d.png`;
	const file = new File([blob], fileName, { type: 'image/png' });
	if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
		await navigator.share({ files: [file], title: fileName });
		return;
	}
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
