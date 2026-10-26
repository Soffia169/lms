/**
 * Запуск unit-тестов web-интерфейса без дочерних процессов.
 *
 * `node --test test` в обычном окружении тоже работает, но этот раннер
 * импортирует файлы в текущем процессе. Так тесты проходят и в песочнице,
 * которая запрещает spawn (см. docs/TROUBLESHOOTING.md), и в CI.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const testDir = import.meta.dirname;

const files = (await readdir(testDir))
    .filter((file) => file.endsWith('.test.js'))
    .sort();

if (files.length === 0) {
    console.error('Не найдено ни одного *.test.js в', testDir);
    process.exitCode = 1;
} else {
    for (const file of files) {
        await import(pathToFileURL(join(testDir, file)).href);
    }
}
