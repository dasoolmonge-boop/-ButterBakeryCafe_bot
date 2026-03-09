// app.js - Сервер для мини-приложения Butter Bakery Cafe
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ADMIN_ID = 1066867845; // ID главного администратора в Telegram
const BOT_TOKEN = "8739833609:AAHVM4_5VwvirZaI1fPe53roNzwsyWy--1Y"; // Токен для уведомлений

// MIME типы для статических файлов
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Файл для хранения данных
const DB_FILE = path.join(__dirname, 'db.json');
// Папка для загруженных изображений
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// Создаем папку для загрузок, если её нет
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Инициализация базы данных
function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            categories: [
                { id: 1, name: "Торты", description: "Авторские торты на любой вкус" },
                { id: 2, name: "Круассаны", description: "Хрустящая слоеная выпечка" },
                { id: 3, name: "Капкейки", description: "Маленькое удовольствие" },
                { id: 4, name: "Пирожные", description: "Нежные десерты" }
            ],
            cakes: [
                {
                    id: 1,
                    name: "Медовик",
                    categoryId: 1,
                    price: 2500,
                    weight: 1.5,
                    description: "Классический медовый торт с нежным кремом",
                    photo: "/uploads/medovik.jpg",
                    available: true
                },
                {
                    id: 2,
                    name: "Наполеон",
                    categoryId: 1,
                    price: 2800,
                    weight: 1.8,
                    description: "Хрустящие коржи с заварным кремом",
                    photo: "/uploads/napoleon.jpg",
                    available: true
                },
                {
                    id: 3,
                    name: "Круассан с миндалем",
                    categoryId: 2,
                    price: 350,
                    weight: 0.15,
                    description: "Свежий круассан с миндальной начинкой",
                    photo: "/uploads/croissant-almond.jpg",
                    available: true
                }
            ],
            users: [
                {
                    id: 1,
                    telegramId: 1066867845,
                    username: "admin",
                    firstName: "Главный администратор",
                    role: "admin",
                    phone: "",
                    createdAt: new Date().toISOString()
                }
            ],
            orders: [],
            nextCakeId: 4,
            nextOrderId: 1,
            nextCategoryId: 5,
            nextUserId: 2
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    }
}

// Чтение данных из БД
function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Ошибка чтения БД:', error);
        return {
            categories: [],
            cakes: [],
            users: [],
            orders: [],
            nextCakeId: 1,
            nextOrderId: 1,
            nextCategoryId: 1,
            nextUserId: 1
        };
    }
}

// Запись данных в БД
function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Ошибка записи БД:', error);
        return false;
    }
}

// Инициализируем БД при старте
initDB();

const server = http.createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // ============================================
    // API ДЛЯ ЗАГРУЗКИ ФОТО
    // ============================================

    if (pathname === '/api/upload' && req.method === 'POST') {
        const boundary = req.headers['content-type'].split('boundary=')[1];
        let body = [];

        req.on('data', chunk => {
            body.push(chunk);
        }).on('end', () => {
            try {
                const buffer = Buffer.concat(body);
                const text = buffer.toString('binary');

                // Ищем имя файла
                const filenameMatch = text.match(/filename="(.+?)"/);
                const filename = filenameMatch ? filenameMatch[1] : `photo_${Date.now()}.jpg`;

                // Ищем содержимое файла
                const fileDataStart = buffer.indexOf('\r\n\r\n') + 4;
                const fileDataEnd = buffer.lastIndexOf('\r\n--' + boundary);

                if (fileDataStart !== -1 && fileDataEnd !== -1) {
                    const fileData = buffer.slice(fileDataStart, fileDataEnd);

                    // Генерируем уникальное имя файла
                    const ext = path.extname(filename) || '.jpg';
                    const newFilename = `cake_${Date.now()}${ext}`;
                    const filePath = path.join(UPLOAD_DIR, newFilename);

                    // Сохраняем файл
                    fs.writeFileSync(filePath, fileData);

                    const fileUrl = `/uploads/${newFilename}`;

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        url: fileUrl,
                        filename: newFilename
                    }));
                } else {
                    throw new Error('Не удалось извлечь данные файла');
                }
            } catch (error) {
                console.error('Ошибка загрузки файла:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка загрузки файла' }));
            }
        });
        return;
    }

    // ============================================
    // API ДЛЯ КАТЕГОРИЙ
    // ============================================

    // Получить все категории (публичные)
    if (pathname === '/api/categories' && req.method === 'GET') {
        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.categories || []));
        return;
    }

    // Получить все категории (админ)
    if (pathname === '/api/admin/categories' && req.method === 'GET') {
        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.categories || []));
        return;
    }

    // Добавить новую категорию (админ)
    if (pathname === '/api/admin/categories' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { name, description } = JSON.parse(body);
                const db = readDB();

                if (!db.categories) db.categories = [];
                if (!db.nextCategoryId) db.nextCategoryId = 1;

                const newCategory = {
                    id: db.nextCategoryId++,
                    name,
                    description: description || ''
                };

                db.categories.push(newCategory);

                if (writeDB(db)) {
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(newCategory));
                } else {
                    throw new Error('Ошибка сохранения');
                }
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Обновить категорию (админ)
    if (pathname.startsWith('/api/admin/categories/') && req.method === 'PUT') {
        const categoryId = parseInt(pathname.split('/').pop());
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const updates = JSON.parse(body);
                const db = readDB();

                const categoryIndex = db.categories.findIndex(c => c.id === categoryId);
                if (categoryIndex === -1) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Категория не найдена' }));
                    return;
                }

                db.categories[categoryIndex] = { ...db.categories[categoryIndex], ...updates };

                if (writeDB(db)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(db.categories[categoryIndex]));
                } else {
                    throw new Error('Ошибка сохранения');
                }
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Удалить категорию (админ)
    if (pathname.startsWith('/api/admin/categories/') && req.method === 'DELETE') {
        const categoryId = parseInt(pathname.split('/').pop());
        const db = readDB();

        // Проверяем, есть ли торты в этой категории
        const cakesInCategory = db.cakes.filter(c => c.categoryId === categoryId);
        if (cakesInCategory.length > 0) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Нельзя удалить категорию, в которой есть товары' }));
            return;
        }

        db.categories = db.categories.filter(c => c.id !== categoryId);

        if (writeDB(db)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Ошибка сохранения' }));
        }
        return;
    }

    // ============================================
    // API ДЛЯ ТОРТОВ
    // ============================================

    // Получить все доступные товары (для клиентов)
    if (pathname === '/api/cakes' && req.method === 'GET') {
        const db = readDB();
        const categoryId = parsedUrl.query.categoryId;

        let availableCakes = db.cakes.filter(c => c.available);

        // Фильтруем по категории, если указана
        if (categoryId) {
            availableCakes = availableCakes.filter(c => c.categoryId === parseInt(categoryId));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(availableCakes));
        return;
    }

    // Получить все товары (для админа)
    if (pathname === '/api/admin/cakes' && req.method === 'GET') {
        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.cakes));
        return;
    }

    // Добавить новый товар (админ)
    if (pathname === '/api/admin/cakes' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const cakeData = JSON.parse(body);
                const db = readDB();

                const newCake = {
                    id: db.nextCakeId++,
                    ...cakeData,
                    available: cakeData.available !== undefined ? cakeData.available : true
                };

                db.cakes.push(newCake);

                if (writeDB(db)) {
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(newCake));
                } else {
                    throw new Error('Ошибка сохранения');
                }
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Обновить товар (админ)
    if (pathname.startsWith('/api/admin/cakes/') && req.method === 'PUT') {
        const cakeId = parseInt(pathname.split('/').pop());
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const updates = JSON.parse(body);
                const db = readDB();

                const cakeIndex = db.cakes.findIndex(c => c.id === cakeId);
                if (cakeIndex === -1) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Товар не найден' }));
                    return;
                }

                db.cakes[cakeIndex] = { ...db.cakes[cakeIndex], ...updates };

                if (writeDB(db)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(db.cakes[cakeIndex]));
                } else {
                    throw new Error('Ошибка сохранения');
                }
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Удалить товар (админ)
    if (pathname.startsWith('/api/admin/cakes/') && req.method === 'DELETE') {
        const cakeId = parseInt(pathname.split('/').pop());
        const db = readDB();

        // Удаляем фото товара
        const cake = db.cakes.find(c => c.id === cakeId);
        if (cake && cake.photo && cake.photo.startsWith('/uploads/')) {
            const photoPath = path.join(__dirname, 'public', cake.photo);
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }

        db.cakes = db.cakes.filter(c => c.id !== cakeId);

        if (writeDB(db)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Ошибка сохранения' }));
        }
        return;
    }

    // ============================================
    // API ДЛЯ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ
    // ============================================

    // Получить/обновить текущего пользователя по Telegram ID
    if (pathname === '/api/user' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { telegramId, username, firstName } = JSON.parse(body);
                const db = readDB();

                if (!db.users) db.users = [];

                let user = db.users.find(u => u.telegramId === telegramId);

                // Если пользователь не найден, создаем как customer
                if (!user) {
                    if (!db.nextUserId) db.nextUserId = 1;

                    user = {
                        id: db.nextUserId++,
                        telegramId,
                        username: username || '',
                        firstName: firstName || 'Пользователь',
                        role: 'customer',
                        phone: '',
                        createdAt: new Date().toISOString()
                    };

                    db.users.push(user);
                    writeDB(db);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(user));
            } catch (error) {
                console.error('Ошибка в /api/user:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Проверка прав администратора
    if (pathname === '/api/check-admin' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { userId } = JSON.parse(body);
                const db = readDB();

                // Проверяем по базе данных или по фиксированному ADMIN_ID
                const user = db.users?.find(u => u.telegramId === userId);
                const isAdminUser = userId === ADMIN_ID || user?.role === 'admin';

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ isAdmin: isAdminUser }));
            } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // ============================================
    // API ДЛЯ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ (АДМИНКА)
    // ============================================

    // Получить всех пользователей (админ)
    if (pathname === '/api/admin/users' && req.method === 'GET') {
        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.users || []));
        return;
    }

    // Получить курьеров (для назначения заказа)
    if (pathname === '/api/admin/couriers' && req.method === 'GET') {
        const db = readDB();
        const couriers = (db.users || []).filter(u => u.role === 'courier');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(couriers));
        return;
    }

    // Добавить пользователя (админ)
    if (pathname === '/api/admin/users' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const userData = JSON.parse(body);
                const db = readDB();

                if (!db.users) db.users = [];
                if (!db.nextUserId) db.nextUserId = 1;

                // Проверяем, нет ли уже такого telegramId
                const existingUser = db.users.find(u => u.telegramId === userData.telegramId);
                if (existingUser) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Пользователь с таким Telegram ID уже существует' }));
                    return;
                }

                const newUser = {
                    id: db.nextUserId++,
                    ...userData,
                    role: userData.role || 'customer',
                    createdAt: new Date().toISOString()
                };

                db.users.push(newUser);

                if (writeDB(db)) {
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(newUser));
                } else {
                    throw new Error('Ошибка сохранения');
                }
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Обновить пользователя (админ)
    if (pathname.startsWith('/api/admin/users/') && req.method === 'PUT') {
        const userId = parseInt(pathname.split('/').pop());
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const updates = JSON.parse(body);
                const db = readDB();

                const userIndex = db.users.findIndex(u => u.id === userId);
                if (userIndex === -1) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Пользователь не найден' }));
                    return;
                }

                db.users[userIndex] = { ...db.users[userIndex], ...updates };

                if (writeDB(db)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(db.users[userIndex]));
                } else {
                    throw new Error('Ошибка сохранения');
                }
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Удалить пользователя (админ)
    if (pathname.startsWith('/api/admin/users/') && req.method === 'DELETE') {
        const userId = parseInt(pathname.split('/').pop());
        const db = readDB();

        db.users = db.users.filter(u => u.id !== userId);

        if (writeDB(db)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Ошибка сохранения' }));
        }
        return;
    }

    // ============================================
    // API ДЛЯ ЗАКАЗОВ
    // ============================================

    // Создать заказ
    if (pathname === '/api/orders' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const orderData = JSON.parse(body);
                const db = readDB();

                const newOrder = {
                    id: db.nextOrderId++,
                    ...orderData,
                    status: 'active', // Новый заказ активен, еще не передан курьеру
                    createdAt: new Date().toISOString(),
                    customerChatId: orderData.userId // Сохраняем ID чата клиента
                };

                if (!db.orders) db.orders = [];
                db.orders.push(newOrder);

                if (writeDB(db)) {
                    // Отправляем уведомление админу
                    sendOrderToAdmin(newOrder);

                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, orderId: newOrder.id }));
                } else {
                    throw new Error('Ошибка сохранения');
                }
            } catch (error) {
                console.error('Ошибка создания заказа:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Получить все заказы (админ)
    if (pathname === '/api/admin/orders' && req.method === 'GET') {
        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.orders || []));
        return;
    }

    // Получить заказы по статусу (админ)
    if (pathname === '/api/admin/orders/active' && req.method === 'GET') {
        const db = readDB();
        const activeOrders = (db.orders || []).filter(o => o.status === 'active');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(activeOrders));
        return;
    }

    if (pathname === '/api/admin/orders/history' && req.method === 'GET') {
        const db = readDB();
        const historyOrders = (db.orders || []).filter(o => o.status !== 'active' && o.status !== 'assigned_to_courier');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(historyOrders));
        return;
    }

    // Назначить курьера на заказ
    if (pathname.match(/\/api\/admin\/orders\/\d+\/assign-courier/) && req.method === 'POST') {
        const orderId = parseInt(pathname.split('/')[4]);
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { courierId } = JSON.parse(body);
                const db = readDB();

                const orderIndex = db.orders.findIndex(o => o.id === orderId);
                if (orderIndex === -1) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Заказ не найден' }));
                    return;
                }

                // Обновляем статус заказа
                db.orders[orderIndex] = {
                    ...db.orders[orderIndex],
                    status: 'assigned_to_courier',
                    courierId: courierId,
                    assignedAt: new Date().toISOString()
                };

                if (writeDB(db)) {
                    const order = db.orders[orderIndex];

                    // Отправляем уведомление курьеру
                    sendNotificationToCourier(order, courierId, db);

                    // Отправляем уведомление клиенту
                    sendNotificationToCustomer(order);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(db.orders[orderIndex]));
                } else {
                    throw new Error('Ошибка сохранения');
                }
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Обновить статус заказа (админ)
    if (pathname.startsWith('/api/admin/orders/') && req.method === 'PUT') {
        const orderId = parseInt(pathname.split('/').pop());
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const updates = JSON.parse(body);
                const db = readDB();

                const orderIndex = db.orders.findIndex(o => o.id === orderId);
                if (orderIndex === -1) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Заказ не найден' }));
                    return;
                }

                db.orders[orderIndex] = { ...db.orders[orderIndex], ...updates };

                if (writeDB(db)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(db.orders[orderIndex]));
                } else {
                    throw new Error('Ошибка сохранения');
                }
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // ============================================
    // РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ
    // ============================================

    // Определяем, какой файл отдавать
    let filePath;
    if (pathname === '/') {
        filePath = path.join(__dirname, 'public', 'index.html');
    } else if (pathname === '/admin') {
        filePath = path.join(__dirname, 'public', 'admin.html');
    } else if (pathname === '/style.css') {
        filePath = path.join(__dirname, 'public', 'style.css');
    } else {
        filePath = path.join(__dirname, 'public', pathname);
    }

    const extname = path.extname(filePath);
    const contentType = mimeTypes[extname] || 'text/plain';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // Если файл не найден, отдаем index.html
                fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, content) => {
                    if (err) {
                        res.writeHead(404);
                        res.end('Файл не найден');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(content, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500);
                res.end(`Ошибка сервера: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// ============================================
// ФУНКЦИИ ДЛЯ УВЕДОМЛЕНИЙ
// ============================================

// Функция отправки сообщения в Telegram
function sendTelegramMessage(chatId, text) {
    const postData = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
    });

    const options = {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            console.log(`Уведомление отправлено в чат ${chatId}`);
        });
    });

    req.on('error', (error) => {
        console.error('Ошибка отправки уведомления:', error);
    });

    req.write(postData);
    req.end();
}

// Функция отправки уведомления админу
function sendOrderToAdmin(orderData) {
    const { name, phone, address, deliveryDate, deliveryTime, wish, cart, totalPrice, userId, username } = orderData;

    const cakesList = cart.map(item =>
        `🍰 ${item.name} - ${item.price} ₽`
    ).join('\n');

    // Определяем домен для ссылки
    const protocol = 'https';
    const host = 'butterbakerycafe.bothost.ru'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ ДОМЕН
    const adminLink = `${protocol}://${host}/admin`;

    const message =
        `📩 **НОВЫЙ ЗАКАЗ ИЗ MINI APP**\n\n` +
        `🍰 **Товары:**\n${cakesList}\n` +
        `💰 **Итого:** ${totalPrice} ₽\n\n` +
        `👤 **Имя:** ${name}\n` +
        `🆔 **Username:** ${username ? '@' + username : 'нет'}\n` +
        `📱 **Телефон:** ${phone}\n` +
        `📍 **Адрес:** ${address}\n` +
        `📅 **Дата доставки:** ${deliveryDate}\n` +
        `⏰ **Время доставки:** ${deliveryTime}\n` +
        `📝 **Пожелания:** ${wish || 'Без пожеланий'}\n` +
        `🆔 **User ID:** ${userId}\n` +
        `📅 **Дата заказа:** ${new Date().toLocaleString('ru-RU')}\n\n` +
        `👑 **Управление заказами:** ${adminLink}`;

    sendTelegramMessage(ADMIN_ID, message);
}

// Уведомление курьеру
function sendNotificationToCourier(order, courierId, db) {
    const courier = db.users.find(u => u.id === courierId);
    if (!courier || !courier.telegramId) return;

    const { name, phone, address, deliveryDate, deliveryTime, wish, cart, totalPrice, id } = order;

    const cakesList = cart.map(item =>
        `🍰 ${item.name} - ${item.price} ₽`
    ).join('\n');

    const message =
        `🚚 **НОВЫЙ ЗАКАЗ ДЛЯ ДОСТАВКИ #${id}**\n\n` +
        `🍰 **Состав:**\n${cakesList}\n` +
        `💰 **Итого:** ${totalPrice} ₽\n\n` +
        `👤 **Клиент:** ${name}\n` +
        `📱 **Телефон:** ${phone}\n` +
        `📍 **Адрес:** ${address}\n` +
        `📅 **Дата доставки:** ${deliveryDate}\n` +
        `⏰ **Время доставки:** ${deliveryTime}\n` +
        `📝 **Пожелания:** ${wish || 'Без пожеланий'}\n\n` +
        `✅ Пожалуйста, доставьте заказ вовремя.`;

    sendTelegramMessage(courier.telegramId, message);
}

// Уведомление клиенту
function sendNotificationToCustomer(order) {
    if (!order.customerChatId) return;

    const message =
        `🛎 **Статус вашего заказа #${order.id} изменен!**\n\n` +
        `🚚 Ваш заказ передан курьеру и скоро будет доставлен!\n\n` +
        `📦 **Детали заказа:**\n` +
        `💰 Сумма: ${order.totalPrice} ₽\n` +
        `📍 Адрес: ${order.address}\n` +
        `📅 Дата: ${order.deliveryDate} в ${order.deliveryTime}\n\n` +
        `💬 Спасибо, что выбрали Butter Bakery Cafe!`;

    sendTelegramMessage(order.customerChatId, message);
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Butter Bakery Cafe сервер запущен на порту ${PORT}`);
    console.log(`📱 Главная страница: http://localhost:${PORT}`);
    console.log(`👑 Админ-панель: http://localhost:${PORT}/admin`);
    console.log(`💾 Данные сохраняются в: ${DB_FILE}`);
    console.log(`📸 Загрузки сохраняются в: ${UPLOAD_DIR}`);

});
