export function portal(node: HTMLElement, target: HTMLElement | string = 'body') {
	const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
	(host ?? document.body).appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
