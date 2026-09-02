#!/bin/bash
# ==============================================================================
# Автоматический скрипт установки LumiCRM на чистый сервер Linux Ubuntu 24.04/22.04 LTS
# ==============================================================================

set -e

echo "=========================================================="
echo "🚀 Начало установки LumiCRM на Linux Ubuntu"
echo "=========================================================="

# 1. Обновление пакетов ОС
echo "📦 Обновление системных пакетов..."
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw build-essential sqlite3 nginx

# 2. Установка Node.js 20 LTS
echo "📦 Установка Node.js LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "✅ Node.js $(node -v) и npm $(npm -v) успешно установлены"

# 3. Подготовка рабочей директории
APP_DIR="/var/www/lamp-crm"
echo "📁 Копирование файлов приложения в $APP_DIR..."
sudo mkdir -p $APP_DIR
sudo cp -r . $APP_DIR/
sudo chown -R $USER:$USER $APP_DIR

cd $APP_DIR

# 4. Установка npm зависимостей
echo "📦 Установка зависимостей npm..."
npm ci --only=production

# 5. Настройка системного сервиса systemd
echo "⚙️ Настройка службы автозапуска systemd..."
sudo cp deploy/lamp-crm.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable lamp-crm
sudo systemctl restart lamp-crm

# 6. Настройка Nginx
echo "🌐 Настройка Nginx..."
sudo cp deploy/nginx.conf /etc/nginx/sites-available/lamp-crm
sudo ln -sf /etc/nginx/sites-available/lamp-crm /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# 7. Настройка брандмауэра UFW
echo "🛡️ Настройка брандмауэра UFW..."
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw --force enable

echo "=========================================================="
echo "🎉 УСТАНОВКА УСПЕШНО ЗАВЕРШЕНА!"
echo "Приложение доступно по IP-адресу вашего сервера в браузере!"
echo "Логин по умолчанию:  admin"
echo "Пароль по умолчанию: admin123"
echo "=========================================================="
