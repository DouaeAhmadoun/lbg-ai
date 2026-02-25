# PPT & Excel Automation Platform

A full-stack application for automated PowerPoint translation (with OCR + AI) and Excel shipment file generation.

## 🎯 Features

### PPT Translation Module
- **Multi-Provider Support**: Claude (Anthropic), OpenRouter, Offline mode
- **OCR + Translation**: Automatically detect text in images and translate
- **Smart Slide Detection**: Only processes slides with images on left side
- **Real-time Progress**: SSE-based live updates during translation
- **Preserve Formatting**: Maintains emojis, line breaks, colors, and styling
- **Slide Selection**: Choose which slides to process (default: all with images)

### Excel Shipment Generator
- **Market-Specific Templates**: IT, ES, FR market support
- **Auto-filtering**: Automatic client filtering by postal code ranges
- **Manual Override**: Manual selection of clients per market
- **Batch Export**: Generate multiple markets at once + ZIP download
- **Preview**: See filtered data before generating files

### Admin Panel
- **Password Protected**: Secure admin access with changeable password
- **API Key Management**: Store and manage Claude/OpenRouter API keys
- **Job History**: Track all translations and generations
- **System Stats**: Monitor costs, storage, and usage
- **File Cleanup**: Manual cleanup of old files (30-day retention)

## 🏗️ Architecture

```
ppt-excel-automation/
├── backend/                 # FastAPI Backend
│   ├── routers/            # API endpoints
│   ├── services/           # Business logic
│   ├── models/             # Database models
│   ├── config/             # Configuration
│   ├── utils/              # Helper functions
│   └── main.py             # Application entry
│
├── frontend/               # React Frontend
│   ├── src/
│   │   ├── pages/         # Route pages
│   │   ├── components/    # Reusable components
│   │   ├── contexts/      # State management
│   │   └── utils/         # Utilities
│   └── public/
│
└── docker-compose.yml      # Docker orchestration
```

## 🚀 Quick Start (Docker - Recommended)

### Prerequisites
- Docker & Docker Compose
- Linux server

### Installation

1. **Clone/Copy the project** to your server

2. **Create environment file**:
```bash
cd backend
cp .env.example .env
```

3. **Edit .env file** (optional - API keys can be set via admin panel):
```bash
nano .env
```

4. **Start the application**:
```bash
cd ..
docker-compose up -d
```

5. **Access the application**:
- Frontend: `http://your-server-ip`
- Backend API: `http://your-server-ip:8000`
- Admin Panel: `http://your-server-ip/admin`

6. **Default admin credentials**:
- Password: `admin123`
- **⚠️ Change this immediately after first login!**

## 🛠️ Manual Installation (Without Docker)

### Backend Setup

1. **Install Python 3.11+**:
```bash
sudo apt update
sudo apt install python3.11 python3.11-venv python3-pip
```

2. **Create virtual environment**:
```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
```

3. **Install dependencies**:
```bash
pip install -r requirements.txt
```

4. **Configure environment**:
```bash
cp .env.example .env
nano .env
```

5. **Run backend**:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend Setup

1. **Install Node.js 20+**:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

2. **Install dependencies**:
```bash
cd frontend
npm install
```

3. **Build for production**:
```bash
npm run build
```

4. **Serve with nginx**:
```bash
sudo apt install nginx
sudo cp nginx.conf /etc/nginx/sites-available/ppt-excel
sudo ln -s /etc/nginx/sites-available/ppt-excel /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## 📖 Usage Guide

### PPT Translation

1. **Navigate to PPT Translation page**
2. **Drag & drop** or select your PowerPoint file
3. **Preview slides** - see which have images on the left
4. **Select slides** to translate (all selected by default)
5. **Choose settings**:
   - Provider (Claude/OpenRouter/Offline)
   - Source language (ES/FR/IT)
   - Target language (EN)
   - Font sizes
6. **Click "Translate"**
7. **Watch real-time progress**
8. **Download** translated PPT

### Excel Shipment Generation

1. **Navigate to Excel Shipment page**
2. **Upload Metabase client data** (Excel file with 'Resultado consulta' sheet)
3. **Upload market templates** (IT, ES, FR)
4. **Select markets** to generate
5. **Choose filter mode**:
   - Auto: Filter by postal code ranges
   - Manual: Select specific clients
6. **Preview** filtered data per market
7. **Generate files**
8. **Download** individual files or ZIP

### Admin Panel

1. **Navigate to /admin**
2. **Login** with password
3. **Manage API Keys**:
   - Add Claude API key
   - Add OpenRouter API key
   - Select default models
4. **View job history**
5. **Check system stats**
6. **Cleanup old files** (30+ days)
7. **Change password**

## 🔑 API Keys

### Claude (Anthropic)
- Get key: https://console.anthropic.com/
- Recommended model: `claude-sonnet-4-20250514`
- Cost: ~$0.003/slide
- Best quality for OCR + translation

### OpenRouter
- Get key: https://openrouter.ai/
- Free models available (Gemini Flash, Llama)
- Optional API key for paid models
- Good for testing

## 🔒 Security Notes

1. **Change default admin password** immediately
2. **Use HTTPS** in production (setup nginx with SSL)
3. **Restrict admin panel** access (firewall/IP whitelist)
4. **API keys** stored encrypted in database
5. **Files auto-deleted** after 30 days

## 📊 System Requirements

### Minimum
- CPU: 2 cores
- RAM: 4GB
- Storage: 20GB
- OS: Linux (Ubuntu 22.04+ recommended)

### Recommended
- CPU: 4 cores
- RAM: 8GB
- Storage: 50GB
- OS: Linux with Docker

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check logs
docker-compose logs backend

# Or if running manually
cd backend
source venv/bin/activate
python main.py
```

### Frontend won't load
```bash
# Check nginx
sudo systemctl status nginx

# Check nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Database errors
```bash
# Reset database
rm backend/app.db
docker-compose restart backend
```

### API key not working
1. Check admin panel → API Keys
2. Verify key is correct
3. Test with simple translation
4. Check backend logs for errors

## 📝 Configuration

### Change default language pairs
Edit `backend/config/settings.py`:
```python
default_source_lang: str = "es"  # Change this
default_target_lang: str = "en"  # Change this
```

### Change file retention period
Edit `backend/config/settings.py`:
```python
file_retention_days: int = 30  # Change this
```

### Add new market (Excel)
Edit `backend/services/excel_service.py`:
1. Add to `COLUMN_MAPPINGS`
2. Add to `TEMPLATE_SHEETS`
3. Add to `POSTAL_CODE_RANGES`

## 🔄 Updates & Maintenance

### Update application
```bash
# Pull latest code
git pull

# Rebuild containers
docker-compose down
docker-compose build
docker-compose up -d
```

### Backup database
```bash
cp backend/app.db backend/app.db.backup
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
```

## 📞 Support

For issues or questions:
1. Check logs first
2. Verify API keys in admin panel
3. Test with a simple file
4. Check server resources (CPU/RAM/disk)

## 🎉 Features Roadmap

- [ ] Batch PPT processing (multiple files at once)
- [ ] Email notifications when jobs complete
- [ ] More translation providers (DeepL, Google)
- [ ] PDF export option for translated slides
- [ ] Advanced filtering options for Excel
- [ ] User accounts with separate histories
- [ ] API webhooks for integrations

## 📄 License

Proprietary - For internal use only

---

**Built with**: FastAPI, React, Vite, Tailwind CSS, Anthropic Claude, and ❤️
