/**
 * End-to-end проверка web-интерфейса в реальном браузере.
 *
 * Управляет headless Chrome по Chrome DevTools Protocol (без Playwright и
 * любых npm-зависимостей): кликает по кнопкам, заполняет формы, проверяет DOM.
 * Покрывает сквозные сценарии этапов 1–2, которые unit-тестами не проверить:
 * вход → создание курса → модуль → урок → публикация → выход, затем
 * регистрация студента → запись на курс (с ретраями, пока снапшот курса
 * не долетел до enrollment-service) → отметка урока → «Мои курсы» →
 * уведомления, и в конце администратор удаляет курс.
 *
 * Требования: запущенный стек (UI на 8088 или dev-server на 5500) и Chrome.
 *
 *   node web/test/ui-e2e.mjs
 *   node web/test/ui-e2e.mjs --base-url http://localhost:5500
 *   CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" node web/test/ui-e2e.mjs
 *
 * ВНИМАНИЕ: сценарий создаёт временный курс (удаляет его в конце) и
 * регистрирует тестового студента — запускайте на локальной базе.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const options = parseArgs(process.argv.slice(2));
const BASE_URL = (options['base-url'] ?? process.env.E2E_BASE_URL ?? 'http://localhost:8088').replace(/\/+$/, '');
const ADMIN_EMAIL = options.email ?? process.env.E2E_ADMIN_EMAIL ?? 'admin@lms.local';
const ADMIN_PASSWORD = options.password ?? process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!';
const HEADLESS = options.headful !== 'true';

const results = [];
let failures = 0;

function check(name, condition, detail = '') {
    if (condition) {
        results.push(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
    } else {
        failures += 1;
        results.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

function step(title) {
    results.push('', `== ${title}`);
}

main()
    .catch((error) => {
        failures += 1;
        results.push(`  FAIL  исключение — ${error?.message ?? error}`);
    })
    .finally(async () => {
        console.log(results.join('\n'));
        const verdict = failures === 0 ? 'PASS' : 'FAIL';
        console.log(`\nRESULT: ${verdict} (${results.filter((line) => line.startsWith('  PASS')).length} проверок, ${failures} ошибок)`);
        process.exit(failures === 0 ? 0 : 1);
    });

async function main() {
    const chromePath = options.chrome ?? process.env.CHROME_PATH ?? findChrome();
    if (!chromePath) {
        throw new Error('Chrome не найден: задайте CHROME_PATH или --chrome');
    }

    const port = await freePort();
    const profileDir = await mkdtemp(join(tmpdir(), 'lms-e2e-'));
    const chrome = spawn(chromePath, [
        '--headless=new',
        ...(HEADLESS ? [] : ['--auto-open-devtools-for-tabs']),
        '--disable-gpu',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        'about:blank',
    ], { stdio: 'ignore' });

    let cdp;
    try {
        cdp = await connectCdp(port);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await runScenario(cdp);
    } finally {
        cdp?.close();
        chrome.kill();
        await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function runScenario(cdp) {
    // ---------- Подготовка ----------
    step('Подготовка');
    await cdp.navigate(`${BASE_URL}/#/login`);
    await cdp.clearStorage();
    await cdp.navigate(`${BASE_URL}/#/login`);
    check('экран входа отрисован', await cdp.waitFor('.auth-page'));
    check('заголовок страницы — Вход', (await cdp.evaluate('document.title')).includes('Вход'));

    // ---------- Вход администратора ----------
    step('Вход администратора');
    await cdp.fill('input[name="email"]', ADMIN_EMAIL);
    await cdp.fill('input[name="password"]', ADMIN_PASSWORD);
    await cdp.click('.auth-card__form button.btn--primary');
    check('переход в каталог', await cdp.waitForHash('/catalog'), await cdp.evaluate('location.hash'));
    check('каталог отрисован', await cdp.waitFor('.toolbar'));
    check('в шапке есть имя администратора', (await cdp.text('.user-chip__name')).includes('Administrator'));
    check('кнопка «Новый курс» доступна администратору', await cdp.waitForFunction('document.body.textContent.includes("Новый курс")'));
    check('администратору не показывают «Мои курсы»', await cdp.waitForFunction(
        '[...document.querySelectorAll(".nav-link")].every((node) => !node.textContent.includes("Мои курсы"))',
    ));
    check('колокольчик уведомлений в шапке', await cdp.exists('a[data-notifications]'));

    // ---------- Создание курса ----------
    step('Создание курса');
    const stamp = new Date().toISOString().slice(11, 19);
    const courseTitle = `E2E курс ${stamp}`;
    await cdp.clickByText('Новый курс');
    check('модальное окно создания курса открыто', await cdp.waitFor('dialog.modal[open]'));
    await cdp.fill('dialog.modal input[name="title"]', courseTitle);
    await cdp.fill('dialog.modal textarea[name="description"]', 'Курс из ui-e2e.mjs');
    await cdp.click('dialog.modal .modal__footer button.btn--primary');
    check('открылась страница курса', await cdp.waitForHash('/courses/'), await cdp.evaluate('location.hash'));
    check('страница курса отрисована', await cdp.waitFor('.course-hero'));
    check('заголовок курса совпадает', (await cdp.text('.course-hero h1')) === courseTitle, await cdp.text('.course-hero h1'));
    check('курс создан черновиком', (await cdp.text('.course-hero .badge')).includes('Черновик'));
    check('показан счётчик записавшихся', await cdp.waitForFunction('document.body.textContent.includes("записались:")'));
    const courseHash = await cdp.evaluate('location.hash');

    // ---------- Модуль и урок ----------
    step('Модуль и урок');
    await cdp.clickByText('Добавить модуль');
    check('модальное окно модуля открыто', await cdp.waitFor('dialog.modal[open]'));
    await cdp.fill('dialog.modal input[name="title"]', 'Модуль E2E');
    await cdp.click('dialog.modal .modal__footer button.btn--primary');
    check('модуль появился на странице', await cdp.waitFor('.module'));
    check('название модуля совпадает', (await cdp.text('.module__title')) === 'Модуль E2E');

    await cdp.click('.module__actions button[aria-label^="Добавить урок"]');
    check('модальное окно урока открыто', await cdp.waitFor('dialog.modal[open]'));
    await cdp.fill('dialog.modal input[name="title"]', 'Урок E2E');
    await cdp.fill('dialog.modal textarea[name="content"]', 'Содержимое урока из ui-e2e.');
    await cdp.click('dialog.modal .modal__footer button.btn--primary');
    check('урок появился в модуле', await cdp.waitFor('.lesson'));
    check('название урока совпадает', (await cdp.text('.lesson__title')) === 'Урок E2E');

    await cdp.click('.lesson__toggle');
    check('содержимое урока раскрывается', await cdp.evaluate('document.querySelector(".lesson__toggle").getAttribute("aria-expanded") === "true"'));
    check('содержимое урока видно', (await cdp.text('.lesson__content')).includes('Содержимое урока'));

    // ---------- Редактирование ----------
    step('Редактирование');
    const editedTitle = `${courseTitle} (изм.)`;
    await cdp.clickByText('Редактировать');
    await cdp.waitFor('dialog.modal[open]');
    await cdp.fill('dialog.modal input[name="title"]', editedTitle);
    await cdp.click('dialog.modal .modal__footer button.btn--primary');
    check('новое название сохранено', await cdp.waitForFunction(`document.querySelector('.course-hero h1')?.textContent === ${JSON.stringify(editedTitle)}`));

    // ---------- Публикация ----------
    step('Публикация');
    await cdp.clickByText('Опубликовать');
    check('статус стал «Опубликован»', await cdp.waitForFunction('document.querySelector(".course-hero .badge")?.textContent.includes("Опубликован")'));

    // ---------- Профиль и тема ----------
    step('Профиль и тема');
    await cdp.click('a[data-route="profile"]');
    check('открыт профиль', await cdp.waitFor('.profile-grid'));
    check('профиль содержит email', (await cdp.text('.identity__email')) === ADMIN_EMAIL);
    check('есть панель администратора', (await cdp.evaluate('[...document.querySelectorAll(".panel__title")].some(n => n.textContent.includes("Администрирование"))')));
    const themeBefore = await cdp.evaluate('document.documentElement.dataset.theme');
    await cdp.click('button[aria-label*="тему"]');
    const themeAfter = await cdp.evaluate('document.documentElement.dataset.theme');
    check('переключатель темы работает', themeBefore !== themeAfter, `${themeBefore} → ${themeAfter}`);
    await cdp.click('button[aria-label*="тему"]');

    // ---------- Выход администратора ----------
    step('Выход администратора');
    await cdp.click('button[aria-label="Выйти"]');
    check('администратор разлогинился', await cdp.waitFor('.auth-page'));

    // ---------- Регистрация студента ----------
    step('Регистрация студента');
    const studentEmail = `e2e-student-${Date.now()}@lms.local`;
    await cdp.click('a[href="#/register"]');
    check('открыт экран регистрации', await cdp.waitFor('.auth-card__form input[name="fullName"]'));
    await cdp.fill('input[name="fullName"]', 'E2E Студент');
    await cdp.fill('input[name="email"]', studentEmail);
    await cdp.fill('input[name="password"]', 'Student123!');
    await cdp.fill('input[name="confirmPassword"]', 'Student123!');
    await cdp.click('.auth-card__form button.btn--primary');
    check('студент вошёл в каталог', await cdp.waitForHash('/catalog'));
    check('студенту не показывают «Новый курс»', await cdp.waitForFunction('!document.body.textContent.includes("Новый курс")'));
    check('роль в шапке — Студент', (await cdp.text('.user-chip__role')) === 'Студент', await cdp.text('.user-chip__role'));
    check('студенту доступна навигация «Мои курсы»', await cdp.waitFor('a[data-route="my-courses"]'));

    // ---------- Запись на курс ----------
    step('Запись на курс');
    check('карточки курсов отрисованы в каталоге', await cdp.waitFor('.course-card'));
    const opened = await cdp.evaluate(`(() => {
        const card = [...document.querySelectorAll('.course-card')]
            .find((node) => node.textContent.includes(${JSON.stringify(editedTitle)}));
        const link = card?.querySelector('.course-card__title a');
        if (!link) { return false; }
        link.click();
        return true;
    })()`);
    check('опубликованный курс найден в каталоге', opened);
    check('страница курса отрисовалась', await cdp.waitFor('.course-hero'));
    check('панель записи видна', await cdp.waitFor('.enroll-panel'));
    check('кнопки управления скрыты', await cdp.waitForFunction('!document.querySelector(".course-hero__actions") && !document.querySelector(".module__actions")'));
    check('кнопка «Записаться» доступна', await cdp.waitForFunction(
        '[...document.querySelectorAll(".enroll-panel button")].some((node) => node.textContent.includes("Записаться"))',
    ));
    const enrolled = await tryEnroll(cdp);
    check('запись создана (ретраи пережидают снапшот курса)', enrolled);
    check('панель показывает «Вы записаны»', await cdp.waitForFunction(
        'document.querySelector(".enroll-panel")?.textContent?.includes("Вы записаны")',
    ));

    // ---------- Прогресс урока ----------
    step('Прогресс урока');
    check('у урока есть отметка «Отметить пройденным»', await cdp.waitFor('.lesson__progress button'));
    const marked = await tryMarkLesson(cdp);
    check('отметка урока прошла', marked);
    check('урок получил класс lesson--done', await cdp.waitFor('.lesson--done'));
    check('панель считает 1 из 1 уроков', await cdp.waitForFunction(
        'document.querySelector(".enroll-panel .progress-meta")?.textContent?.includes("Пройдено 1 из 1")',
    ));

    // ---------- Мои курсы ----------
    step('Мои курсы');
    await cdp.click('a[data-route="my-courses"]');
    check('экран «Мои курсы» отрисован', await cdp.waitFor('.enroll-grid'));
    check('карточка активной записи есть', await cdp.waitFor('.enroll-card'));
    check('название курса на карточке', (await cdp.text('.enroll-card .course-card__title')) === editedTitle, await cdp.text('.enroll-card .course-card__title'));
    check('прогресс на карточке — 100%', await cdp.waitForFunction(
        'document.querySelector(".enroll-card .progress__bar")?.dataset.done === "true"',
    ));

    // ---------- Уведомления ----------
    step('Уведомления');
    await cdp.click('a[data-notifications]');
    check('открыт экран уведомлений', await cdp.waitForHash('/notifications'));
    check('список уведомлений отрисован', await cdp.waitFor('.notification'));
    check('есть уведомление о записи на курс', await cdp.waitForFunction('document.body.textContent.includes("Вы записаны на курс")'));
    check('есть уведомление о пройденном уроке', await cdp.waitForFunction('document.body.textContent.includes("Урок завершён")'));
    check('после просмотра счётчик «новых» обнулён', await cdp.waitForFunction(
        'document.querySelector(".notification-badge")?.hidden === true',
    ));

    // ---------- Удаление курса ----------
    step('Выход студента');
    await cdp.click('button[aria-label="Выйти"]');
    check('студент разлогинился', await cdp.waitFor('.auth-page'));
    check('сессия удалена из localStorage', (await cdp.evaluate('localStorage.getItem("lms.session.v1")')) === null);

    step('Удаление курса администратором');
    await cdp.fill('input[name="email"]', ADMIN_EMAIL);
    await cdp.fill('input[name="password"]', ADMIN_PASSWORD);
    await cdp.click('.auth-card__form button.btn--primary');
    check('администратор снова в каталоге', await cdp.waitForHash('/catalog'));
    await cdp.navigate(`${BASE_URL}/${courseHash}`);
    check('курс снова открыт', await cdp.waitFor('.course-hero'));
    await cdp.clickByText('Удалить');
    check('диалог подтверждения открыт', await cdp.waitFor('dialog.modal[open]'));
    await cdp.click('dialog.modal .modal__footer button.btn--danger');
    check('после удаления открыт каталог', await cdp.waitForHash('/catalog'));
    check('удалённого курса нет в списке', await cdp.waitForFunction(`!document.body.textContent.includes(${JSON.stringify(editedTitle)})`));
}

/**
 * Жмёт «Записаться», пережидая гонку со снапшотом курса: пока событие
 * course.published не долетело до enrollment-service, бэкенд отвечает 404 —
 * панель остаётся с кнопкой, сценарий пробует снова до 25 секунд.
 *
 * @param {object} cdp
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
async function tryEnroll(cdp, timeoutMs = 25_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await cdp.evaluate(
            'document.querySelector(".enroll-panel")?.textContent?.includes("Вы записаны") ?? false',
        )) {
            return true;
        }
        const clicked = await cdp.evaluate(`
            (() => {
                const button = [...document.querySelectorAll(".enroll-panel button")]
                    .find((node) => node.textContent.includes("Записаться"));
                if (!button) { return false; }
                button.click();
                return true;
            })()
        `);
        if (clicked && await cdp.waitForFunction(
            'document.querySelector(".enroll-panel")?.textContent?.includes("Вы записаны") ?? false',
            4_000,
        )) {
            return true;
        }
        await sleep(600);
    }
    return false;
}

/**
 * Отмечает урок пройденным: клик по кнопке в .lesson__progress и ожидание
 * класса lesson--done (представление перезагружается после отметки).
 *
 * @param {object} cdp
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
async function tryMarkLesson(cdp, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await cdp.evaluate('!!document.querySelector(".lesson--done")')) {
            return true;
        }
        const clicked = await cdp.evaluate(`
            (() => {
                const button = document.querySelector(".lesson__progress button");
                if (!button) { return false; }
                button.click();
                return true;
            })()
        `);
        if (clicked && await cdp.waitForFunction('!!document.querySelector(".lesson--done")', 3_000)) {
            return true;
        }
        if (clicked) {
            // Клик прошёл, но отметка не применилась — ждать большего смысла
            // нет: что-то случилось не только со снапшотом.
            return false;
        }
        await sleep(400);
    }
    return false;
}

// ---------------------------------------------------------------------------
// CDP-клиент
// ---------------------------------------------------------------------------

async function connectCdp(port) {
    const deadline = Date.now() + 20_000;
    let targets = null;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/list`);
            if (response.ok) {
                targets = await response.json();
                if (targets.length > 0) {
                    break;
                }
            }
        } catch {
            // Chrome ещё поднимается.
        }
        await sleep(150);
    }
    if (!targets || targets.length === 0) {
        throw new Error('не удалось подключиться к Chrome DevTools');
    }

    const page = targets.find((target) => target.type === 'page') ?? targets[0];
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', () => reject(new Error('WebSocket CDP не открылся')), { once: true });
    });

    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) {
                reject(new Error(`${message.error.message} (${message.error.code})`));
            } else {
                resolve(message.result);
            }
        }
    });

    const client = {
        raw: socket,
        send(method, params = {}) {
            const id = ++nextId;
            socket.send(JSON.stringify({ id, method, params }));
            return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        },
        async evaluate(expression, { awaitPromise = true } = {}) {
            const result = await client.send('Runtime.evaluate', {
                expression,
                awaitPromise,
                returnByValue: true,
                userGesture: true,
            });
            if (result.exceptionDetails) {
                throw new Error(result.exceptionDetails.exception?.description ?? 'ошибка evaluate');
            }
            return result.result?.value;
        },
        async navigate(url) {
            await client.send('Page.navigate', { url });
            await client.waitForFunction('document.readyState === "complete"', 15_000);
        },
        async clearStorage() {
            await client.evaluate('localStorage.clear(); sessionStorage.clear(); true');
        },
        async exists(selector) {
            return client.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
        },
        async text(selector) {
            return (await client.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ""`)) ?? '';
        },
        async fill(selector, value) {
            const filled = await client.evaluate(`
                (() => {
                    const input = document.querySelector(${JSON.stringify(selector)});
                    if (!input) { return false; }
                    input.value = ${JSON.stringify(value)};
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                })()
            `);
            if (!filled) {
                throw new Error(`поле не найдено: ${selector}`);
            }
        },
        async click(selector) {
            await client.waitFor(selector);
            const clicked = await client.evaluate(`
                (() => {
                    const element = document.querySelector(${JSON.stringify(selector)});
                    if (!element) { return false; }
                    element.click();
                    return true;
                })()
            `);
            if (!clicked) {
                throw new Error(`элемент не найден для клика: ${selector}`);
            }
            await sleep(60);
        },
        async clickByText(text, selector = 'button, a', timeout = 10_000) {
            const present = await client.waitForFunction(
                `[...document.querySelectorAll(${JSON.stringify(selector)})].some((node) => node.textContent.includes(${JSON.stringify(text)}))`,
                timeout,
            );
            if (!present) {
                throw new Error(`не найден элемент с текстом «${text}»`);
            }
            const clicked = await client.evaluate(`
                (() => {
                    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
                        .find((node) => node.textContent.includes(${JSON.stringify(text)}));
                    if (!element) { return false; }
                    element.click();
                    return true;
                })()
            `);
            if (!clicked) {
                throw new Error(`не найден элемент с текстом «${text}»`);
            }
            await sleep(60);
        },
        async waitForFunction(expression, timeout = 10_000) {
            const deadline = Date.now() + timeout;
            while (Date.now() < deadline) {
                try {
                    if (await client.evaluate(`Boolean(${expression})`, { awaitPromise: false })) {
                        return true;
                    }
                } catch {
                    // страница могла перезагрузиться — пробуем снова
                }
                await sleep(100);
            }
            return false;
        },
        async waitFor(selector, timeout = 10_000) {
            return client.waitForFunction(`document.querySelector(${JSON.stringify(selector)})`, timeout);
        },
        async waitForHash(fragment, timeout = 10_000) {
            return client.waitForFunction(`location.hash.includes(${JSON.stringify(fragment)})`, timeout);
        },
        close() {
            socket.close();
        },
    };

    return client;
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const parsed = {};
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (!argument.startsWith('--')) {
            continue;
        }
        const [key, inlineValue] = argument.slice(2).split('=');
        parsed[key] = inlineValue ?? argv[index + 1];
        if (inlineValue === undefined && argv[index + 1] && !argv[index + 1].startsWith('--')) {
            index += 1;
        }
    }
    return parsed;
}

function findChrome() {
    const candidates = [
        process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
        process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
        process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
        process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
