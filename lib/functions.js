import fs from 'fs';
import path from 'path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function cleanTempFiles() {
    const tempDir = path.resolve('temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    fs.readdir(tempDir, (err, files) => {
        if (err) return;
        for (const file of files) {
            const filePath = path.join(tempDir, file);
            fs.unlink(filePath, () => {});
        }
    });
}

export function formatYutaMenu(menuContent) {
    return `╭──『 **YUTA & RIKA** 』──
│ Rika está lista. Elige una opción:
│
${menuContent}
│
╰──────────────────`;
}
