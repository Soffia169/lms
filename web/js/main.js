/**
 * Точка входа web-интерфейса LMS.
 *
 * Собирает приложение из независимых модулей:
 *   core/*  — транспорт, сессия, роутер (без DOM-зависимостей там, где можно);
 *   api/*   — методы auth-service, course-service, enrollment и notification;
 *   ui/*    — каркас, формы, модальные окна, состояния;
 *   views/* — экраны.
 *
 * Здесь же — единственные сквозные вещи: реакция на истечение сессии,
 * синхронизация вкладок, периодический ping API и опрос уведомлений.
 */

import { createTheme } from './ui/theme.js';
import { toasts } from './ui/toast.js';
import { createLayout } from './ui/layout.js';
import { openApiSettings } from './ui/api-settings.js';
import { createSessionStore } from './core/session.js';
import { createApiClient } from './core/client.js';
import { createRouter } from './core/router.js';
import { createAuthApi } from './api/auth.js';
import { createCoursesApi } from './api/courses.js';
import { createEnrollmentsApi } from './api/enrollments.js';
import { createNotificationsApi } from './api/notifications.js';
import { latestNotificationAt, readSeenAt, unseenCount, writeSeenAt } from './core/notifications.js';
import { DEFAULT_API_BASE, resolveApiBase, resetApiBase, setApiBase } from './core/config.js';
import { describeError } from './core/errors.js';
import { loginView } from './views/login.js';
import { registerView } from './views/register.js';
import { catalogView } from './views/catalog.js';
import { courseView } from './views/course.js';
import { myCoursesView } from './views/my-courses.js';
import { notificationsView } from './views/notifications.js';
import { profileView } from './views/profile.js';
import { notFoundView } from './views/not-found.js';

const PING_INTERVAL_MS = 60_000;

bootstrap();

function bootstrap() {
    const headerElement = document.getElementById('app-header');
    const footerElement = document.getElementById('app-footer');
    const outlet = document.getElementById('view');

    if (!headerElement || !footerElement || !outlet) {
        throw new Error('Не найдены контейнеры приложения (#app-header, #app-footer, #view)');
    }

    const theme = createTheme();
    const session = createSessionStore();

    let apiBase = resolveApiBase();
    /** @type {ReturnType<typeof createAuthApi>} */
    let authApi;

    const client = createApiClient({
        baseUrl: () => apiBase,
        session,
        refreshSession: (refreshToken) => authApi.refresh(refreshToken),
        onSessionExpired: (error) => handleSessionExpired(error),
    });
    authApi = createAuthApi({ client });
    const coursesApi = createCoursesApi({ client });
    const enrollmentsApi = createEnrollmentsApi({ client });
    const notificationsApi = createNotificationsApi({ client });

    let layout;
    /** Последний загруженный список уведомлений — для подсчёта «новых». */
    let notificationItems = [];
    let notificationsToken = 0;

    const router = createRouter({
        outlet,
        routes: [
            { name: 'login', path: '/login', view: loginView, guest: true, title: 'Вход' },
            { name: 'register', path: '/register', view: registerView, guest: true, title: 'Регистрация' },
            { name: 'catalog', path: '/catalog', view: catalogView, auth: true, title: 'Каталог' },
            { name: 'course', path: '/courses/:id', view: courseView, auth: true, title: 'Курс' },
            { name: 'my-courses', path: '/my-courses', view: myCoursesView, auth: true, title: 'Мои курсы' },
            { name: 'notifications', path: '/notifications', view: notificationsView, auth: true, title: 'Уведомления' },
            { name: 'profile', path: '/profile', view: profileView, auth: true, title: 'Профиль' },
        ],
        notFoundView,
        defaultPath: session.isAuthenticated() ? '/catalog' : '/login',
        isAuthenticated: () => session.isAuthenticated(),
        context: {
            auth: authApi,
            courses: coursesApi,
            enrollments: enrollmentsApi,
            notifications: notificationsApi,
            markNotificationsSeen,
            client,
            session,
            theme,
            logout,
            navigate,
            openSettings,
            apiBase: () => apiBase,
            pingApi,
            describeError,
        },
        onNavigate: (route) => layout.setActive(route?.name ?? null),
    });

    layout = createLayout({
        header: headerElement,
        footer: footerElement,
        session,
        theme,
        apiBase: () => apiBase,
        onLogout: () => {
            void logout();
        },
        onOpenSettings: openSettings,
    });

    theme.subscribe(() => layout.render());
    session.subscribe((next) => {
        layout.render();
        if (!next && router.current?.route?.auth) {
            navigate('/login', { replace: true });
        }
        // Вход вышел или сменился пользователь — счётчик пересчитываем: список
        // принадлежит предыдущему пользователю, а при выходе он просто пуст.
        void refreshNotifications();
    });

    // Синхронизация между вкладками: выход в одной вкладке разлогинивает все.
    globalThis.addEventListener('storage', (event) => {
        if (session.handleStorageEvent(event)) {
            layout.render();
        }
    });

    // Клик по ссылке-якорю не должен управлять hash вручную — это делает роутер.
    router.start();
    void pingApi();
    void refreshNotifications();
    setInterval(() => {
        void pingApi();
        void refreshNotifications();
    }, PING_INTERVAL_MS);

    globalThis.addEventListener('unhandledrejection', (event) => {
        console.error('[lms] unhandled rejection', event.reason);
    });

    function navigate(path, options) {
        router.navigate(path, options);
    }

    /**
     * Единая реакция на потерю сессии: сообщение + переход на вход.
     *
     * @param {unknown} error
     * @returns {void}
     */
    function handleSessionExpired(error) {
        const now = Date.now();
        if (now - (handleSessionExpired.lastAt ?? 0) < 2_000) {
            return;
        }
        handleSessionExpired.lastAt = now;

        if (error) {
            console.warn('[lms] сессия завершена:', describeError(error));
        }
        toasts.warn('Сессия истекла или отозвана — войдите снова.', 'Требуется вход');
        const currentPath = globalThis.location.hash.replace(/^#/, '') || '/catalog';
        if (!currentPath.startsWith('/login')) {
            navigate(`/login?next=${encodeURIComponent(currentPath)}`, { replace: true });
        }
    }

    async function logout() {
        const refreshToken = session.refreshToken();
        try {
            if (refreshToken) {
                await authApi.logout(refreshToken);
            }
        } catch (error) {
            // Токен мог быть уже отозван или истёк — выйти пользователю это не мешает.
            console.warn('[lms] logout:', describeError(error));
        } finally {
            session.clear('logout');
            toasts.info('Вы вышли из аккаунта');
            navigate('/login', { replace: true });
        }
    }

    function openSettings() {
        openApiSettings({
            currentBase: apiBase,
            onSave: (next) => {
                apiBase = next;
                setApiBase(next);
                toasts.success(`Адрес API: ${next}`);
                layout.render();
                void pingApi();
                if (session.isAuthenticated()) {
                    router.reload();
                }
            },
            onReset: () => {
                apiBase = resetApiBase();
                toasts.info(`Адрес API сброшен на ${DEFAULT_API_BASE}`);
                layout.render();
                void pingApi();
                if (session.isAuthenticated()) {
                    router.reload();
                }
            },
        });
    }

    async function pingApi() {
        layout.setApiStatus({ state: 'checking', label: 'проверяю соединение…' });
        const result = await client.ping();
        layout.setApiStatus(result.ok
            ? { state: 'online', label: `соединение есть · ${result.latencyMs} мс` }
            : { state: 'offline', label: 'API недоступен', title: describeError(result.error) });
        return result;
    }

    /**
     * Опрос уведомлений: сколько пришло позже последнего просмотра
     * (`#/notifications`). Фон не критичен — ошибка только в консоль, чтобы
     * колокольчик не «кидал» тостами каждые 60 секунд.
     *
     * @returns {Promise<void>}
     */
    async function refreshNotifications() {
        if (!session.isAuthenticated()) {
            notificationItems = [];
            layout.setNotificationCount(0);
            return;
        }
        const token = ++notificationsToken;
        try {
            const items = await notificationsApi.listMine();
            if (token !== notificationsToken) {
                return; // ответ устарел: сессия или опрос изменились
            }
            notificationItems = Array.isArray(items) ? items : [];
        } catch (error) {
            if (token === notificationsToken) {
                console.warn('[lms] уведомления:', describeError(error));
            }
            return;
        }
        layout.setNotificationCount(unseenCount(notificationItems, readSeenAt()));
    }

    /**
     * Экран уведомлений отмечает просмотр: всё, что уже пришло, «новым»
     * не считается. Отметка живёт только в localStorage клиента.
     *
     * @param {Array<object>} [items] только что показанный список
     * @returns {void}
     */
    function markNotificationsSeen(items = notificationItems) {
        writeSeenAt(latestNotificationAt(items) ?? Date.now());
        layout.setNotificationCount(0);
    }
}
