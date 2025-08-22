# Hosting Setup Guide for Naweririmba

## Files Added/Modified for Hosting Compatibility:

### 1. `.htaccess` (Apache Configuration)
- Redirects `index.php` to `/home`
- Redirects root `/` to `/home`
- Protects sensitive files
- Sets proper MIME types

### 2. `index.php` (PHP Redirect)
- Physical PHP file that redirects to `/home`
- Fallback for hosting environments expecting PHP

### 3. Node.js Routes Added:
- `GET /home` - Same content as root route
- `GET /index.php` - Redirects to `/home`

### 4. SEO Updates:
- Updated `robots.txt` to include `/home`
- Updated `sitemap.xml` to include `/home`

## Deployment Steps:

### For cPanel/Shared Hosting:

1. **Upload Files:**
   - Upload all files to your hosting directory
   - Ensure `.htaccess` is in the root directory
   - Ensure `index.php` is in the root directory

2. **Node.js Setup (if supported):**
   - Set main entry point to `app.js`
   - Install dependencies: `npm install`
   - Start app: `npm start`

3. **Environment Variables:**
   - Copy `.env.example` to `.env`
   - Update database credentials in `.env`
   - Update hosting-specific settings

4. **Database Setup:**
   - Create MySQL database
   - Run `node models/init-db.js` to initialize

### For Node.js Hosting (Heroku, Railway, etc.):

1. **Set Start Command:**
   ```bash
   npm start
   ```

2. **Environment Variables:**
   - Set `NODE_ENV=production`
   - Set database credentials
   - Set `PORT` (usually auto-assigned)

### Testing:

After deployment, test these URLs:
- `https://yourdomain.com/` → should redirect to `/home`
- `https://yourdomain.com/index.php` → should redirect to `/home`
- `https://yourdomain.com/home` → should show the home page

## URL Structure:

- **Root:** `/` → redirects to `/home`
- **Home:** `/home` → main landing page
- **Songs:** `/songs` → song listings
- **About:** `/about` → about page
- **Contact:** `/contact` → contact page
- **Auth:** `/login`, `/register` → authentication
- **User:** `/users/dashboard`, `/users/profile` → user pages
- **Admin:** `/admin/*` → admin panel

## Notes:

- Both `/` and `/home` serve the same content
- `index.php` redirects to `/home` for hosting compatibility
- All sensitive files are protected by `.htaccess`
- SEO is maintained with proper redirects and sitemap updates
