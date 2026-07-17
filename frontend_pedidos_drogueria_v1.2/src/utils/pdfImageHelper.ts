const MM_TO_PX = 120 / 25.4; // 120 DPI — suficiente para impresión

export function compressImageForPDF(
    src: string,
    widthMm: number,
    heightMm: number,
    quality = 0.8,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const w = Math.round(widthMm * MM_TO_PX);
            const h = Math.round(heightMm * MM_TO_PX);
            const canvas = document.createElement('canvas');
            canvas.width  = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = src;
    });
}
